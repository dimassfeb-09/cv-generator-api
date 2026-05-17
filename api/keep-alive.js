import { getPool } from "../lib/db.js";

/**
 * GET /api/keep-alive
 * A simple endpoint called periodically to keep the Supabase database awake.
 */
export default async function handler(req, res) {
  // Allow GET and POST for convenience (e.g. UptimeRobot or third-party crons)
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Optional: Verify Vercel Cron Secret for security if it's configured in Vercel Env
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const pool = getPool();
  let client;
  
  try {
    client = await pool.connect();
    // A very lightweight query to trigger activity and keep Postgres active
    const result = await client.query("SELECT 1 as keep_alive");
    
    return res.status(200).json({
      success: true,
      message: "Supabase database pinged successfully! Database is active.",
      timestamp: new Date().toISOString(),
      data: result.rows[0],
    });
  } catch (error) {
    console.error("[Keep-Alive Error]:", error);
    return res.status(500).json({
      success: false,
      error: "Database ping failed",
      message: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}
