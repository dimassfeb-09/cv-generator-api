import { getPool } from "../../../lib/db.js";
import { sendLoginOTP } from "../../../lib/email.js";

/**
 * POST /api/auth/login/request
 * Payload: { email }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    // 1. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 2. Save OTP to DB with purpose 'LOGIN'
    await dbClient.query(
      `INSERT INTO verification_codes (email, code, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [email, otp, 'LOGIN', expiresAt]
    );

    // 3. Send Email
    try {
      await sendLoginOTP(email, otp);
    } catch (mailErr) {
      console.error("[LOGIN OTP EMAIL] Failed to send:", mailErr);
      return res.status(500).json({ error: "Failed to send email. Check SMTP config." });
    }

    return res.status(200).json({
      success: true,
      message: `Login verification code has been sent to ${email}`
    });

  } catch (err) {
    console.error("[LOGIN REQUEST] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
