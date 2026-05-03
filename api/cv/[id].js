import { getPool } from "../../lib/db.js";
import { getSignedUrl } from "../../lib/storage.js";
import { getFullCVData } from "../../lib/cv-service.js";
import { verifyToken } from "../../lib/auth.js";

/**
 * GET & DELETE /api/cv/[id]
 */
export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "cv_id is required" });

  // 0. Verify JWT
  let decodedUser;
  try {
    decodedUser = verifyToken(req);
  } catch (authErr) {
    return res.status(401).json({ error: authErr.message });
  }

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    if (req.method === "GET") {
      const fullData = await getFullCVData(dbClient, id);
      if (!fullData) return res.status(404).json({ error: "CV not found" });

      // Ownership Check
      if (fullData.owner_email !== decodedUser.email) {
        return res.status(403).json({ error: "Access denied: You do not own this CV" });
      }

      // Refresh signed URL
      let downloadUrl = fullData.pdf_url;
      try {
        const { signedUrl } = await getSignedUrl(`cv-${id}.pdf`);
        downloadUrl = signedUrl;
      } catch (e) {
        console.warn("[GET CV] Signed URL failed");
      }

      return res.status(200).json({
        success: true,
        data: { ...fullData, download_url: downloadUrl }
      });
    } 
    
    if (req.method === "DELETE") {
      const ownerEmail = req.headers["x-owner-email"];
      const verificationCode = req.headers["x-verification-code"];

      if (!ownerEmail) return res.status(401).json({ error: "Ownership verification required (x-owner-email header)" });
      if (!verificationCode) return res.status(401).json({ error: "Verification code required (x-verification-code header)" });

      await dbClient.query("BEGIN");

      // 1. Verify OTP
      const otpRes = await dbClient.query(
        `SELECT id FROM verification_codes 
         WHERE email = $1 AND code = $2 AND purpose = 'DELETE_SINGLE' 
         AND cv_id = $3 AND expires_at > NOW()`,
        [ownerEmail, verificationCode, id]
      );

      if (otpRes.rows.length === 0) {
        await dbClient.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid or expired verification code" });
      }

      // 2. Fetch full snapshot for backup
      const fullData = await getFullCVData(dbClient, id);
      if (!fullData) {
        await dbClient.query("ROLLBACK");
        return res.status(404).json({ error: "CV not found" });
      }

      // 3. Validate Ownership
      if (fullData.owner_email !== ownerEmail) {
        await dbClient.query("ROLLBACK");
        return res.status(403).json({ error: "You are not authorized to delete this CV" });
      }

      // 4. Backup to cv_backup
      await dbClient.query(
        `INSERT INTO cv_backup (cv_id, owner_email, original_data, deleted_by)
         VALUES ($1, $2, $3, $4)`,
        [id, fullData.owner_email, JSON.stringify(fullData), ownerEmail]
      );

      // 5. Delete from main table
      await dbClient.query(`DELETE FROM cv_documents WHERE id = $1`, [id]);

      // 6. Delete OTP (one-time use)
      await dbClient.query(`DELETE FROM verification_codes WHERE id = $1`, [otpRes.rows[0].id]);

      await dbClient.query("COMMIT");

      // 7. Send Notify Email
      try {
        const { sendDeletionNotice } = await import("../../lib/email.js");
        await sendDeletionNotice(ownerEmail, `CV dengan judul "${fullData.title}" (ID: ${id}) telah berhasil dihapus.`);
      } catch (e) {
        console.warn("[DELETE NOTICE] Failed to send email notice");
      }

      return res.status(200).json({
        success: true,
        message: "CV has been backed up and deleted successfully. Confirmation email sent."
      });
    }

    return res.status(405).json({ error: "Method Not Allowed" });

  } catch (err) {
    if (req.method === "DELETE") await dbClient.query("ROLLBACK");
    console.error("[API CV ID] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
