import { getPool } from "../../../lib/db.js";
import crypto from "crypto";

/**
 * POST /api/auth/login/verify
 * Payload: { email, code }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");

    // 1. Verify OTP
    const otpRes = await dbClient.query(
      `SELECT id FROM verification_codes 
       WHERE email = $1 AND code = $2 AND purpose = 'LOGIN' 
       AND expires_at > NOW()`,
      [email, code]
    );

    if (otpRes.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid or expired login code" });
    }

    // 2. Check if user exists
    let userRes = await dbClient.query("SELECT * FROM users WHERE email = $1", [email]);
    let user = null;

    if (userRes.rows.length === 0) {
      // 3. Register New User if not exists
      const userId = crypto.randomUUID();
      const newUserRes = await dbClient.query(
        "INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *",
        [userId, email, email.split('@')[0]] // Default name from email prefix
      );
      user = newUserRes.rows[0];
    } else {
      user = userRes.rows[0];
    }

    // 4. Delete OTP (one-time use)
    await dbClient.query("DELETE FROM verification_codes WHERE id = $1", [otpRes.rows[0].id]);

    await dbClient.query("COMMIT");

    // 5. Generate JWT
    const { generateToken } = await import("../../../lib/auth.js");
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at
      }
    });

  } catch (err) {
    await dbClient.query("ROLLBACK");
    console.error("[LOGIN VERIFY] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
