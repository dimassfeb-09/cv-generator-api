import { getPool } from "../../../lib/db.js";

/**
 * GET /api/cv/user/[email]
 * Fetches all CVs associated with a user's email address.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "User email is required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
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

  } catch (err) {
    console.error("[GET USER CVS] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
