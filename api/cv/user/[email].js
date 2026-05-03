import { getPool } from "../../../lib/db.js";
import { getFullCVData } from "../../../lib/cv-service.js";
import { verifyToken } from "../../../lib/auth.js";

/**
 * GET & DELETE /api/cv/user/[email]
 */
export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "User email is required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    if (req.method === "GET") {
      // 0. Verify JWT (Only for History)
      let decodedUser;
      try {
        decodedUser = verifyToken(req);
      } catch (authErr) {
        return res.status(401).json({ error: authErr.message });
      }

      // Ownership Check: User can only see their own email history
      if (decodedUser.email !== email) {
        return res.status(403).json({ error: "Access denied: You can only view your own history" });
      }

      const result = await dbClient.query(
        `SELECT cv.id, cv.title, cv.pdf_url, cv.status, cv.created_at
         FROM cv_documents cv
         JOIN users u ON u.id = cv.user_id
         WHERE u.email = $1
         ORDER BY cv.created_at DESC`,
        [email]
      );

      return res.status(200).json({
        success: true,
        count: result.rows.length,
        cvs: result.rows
      });
    }

    if (req.method === "DELETE") {
      const ownerEmailHeader = req.headers["x-owner-email"];
      const verificationCode = req.headers["x-verification-code"];

      if (ownerEmailHeader !== email) {
        return res.status(403).json({ error: "Forbidden: You can only delete your own data" });
      }
      if (!verificationCode) {
        return res.status(401).json({ error: "Verification code required (x-verification-code header)" });
      }

      await dbClient.query("BEGIN");

      // 1. Verify OTP
      const otpRes = await dbClient.query(
        `SELECT id FROM verification_codes 
         WHERE email = $1 AND code = $2 AND purpose = 'DELETE_ALL' 
         AND expires_at > NOW()`,
        [email, verificationCode]
      );

      if (otpRes.rows.length === 0) {
        await dbClient.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid or expired verification code" });
      }

      // 2. Find all CV IDs for this email
      const cvsResult = await dbClient.query(
        `SELECT cv.id FROM cv_documents cv
         JOIN users u ON u.id = cv.user_id
         WHERE u.email = $1`, [email]
      );

      if (cvsResult.rows.length === 0) {
        await dbClient.query("ROLLBACK");
        return res.status(404).json({ error: "No CVs found for this user" });
      }

      // 3. Backup each CV
      for (const row of cvsResult.rows) {
        const fullData = await getFullCVData(dbClient, row.id);
        if (fullData) {
          await dbClient.query(
            `INSERT INTO cv_backup (cv_id, owner_email, original_data, deleted_by)
             VALUES ($1, $2, $3, $4)`,
            [row.id, email, JSON.stringify(fullData), email]
          );
        }
      }

      // 4. Delete all CVs for this user
      await dbClient.query(
        `DELETE FROM cv_documents 
         WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, 
        [email]
      );

      // 5. Delete OTP
      await dbClient.query(`DELETE FROM verification_codes WHERE id = $1`, [otpRes.rows[0].id]);

      await dbClient.query("COMMIT");

      // 6. Send Notify Email
      try {
        const { sendDeletionNotice } = await import("../../../lib/email.js");
        await sendDeletionNotice(email, `Seluruh data CV Anda (${cvsResult.rows.length} dokumen) telah berhasil dihapus secara permanen.`);
      } catch (e) {
        console.warn("[MASS DELETE NOTICE] Failed to send email notice");
      }

      return res.status(200).json({
        success: true,
        message: `Successfully backed up and deleted ${cvsResult.rows.length} CVs. Confirmation email sent.`
      });
    }

    return res.status(405).json({ error: "Method Not Allowed" });

  } catch (err) {
    if (req.method === "DELETE") await dbClient.query("ROLLBACK");
    console.error("[API USER CVS DELETE] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
