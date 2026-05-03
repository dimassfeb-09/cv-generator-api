import { getPool } from "../../../lib/db.js";
import { sendOTP } from "../../../lib/email.js";

/**
 * POST /api/cv/delete/request
 * Payload: { email, cv_id (optional) }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, cv_id } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    // 1. Verify user exists
    const userRes = await dbClient.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const purpose = cv_id ? "Hapus Satu CV" : "Hapus Semua Data CV";
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 3. Save OTP to DB
    await dbClient.query(
      `INSERT INTO verification_codes (email, code, purpose, cv_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, otp, cv_id ? 'DELETE_SINGLE' : 'DELETE_ALL', cv_id || null, expiresAt]
    );

    // 4. Send Email
    try {
      await sendOTP(email, otp, purpose);
    } catch (mailErr) {
      console.error("[OTP EMAIL] Failed to send:", mailErr);
      return res.status(500).json({ error: "Failed to send email. Check SMTP config." });
    }

    return res.status(200).json({
      success: true,
      message: `Verification code has been sent to ${email}`
    });

  } catch (err) {
    console.error("[OTP REQUEST] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
