import pg from "pg";

const { Pool } = pg;

let pool;

/**
 * Returns a singleton instance of the pg Pool.
 * Optimized for Vercel serverless functions by limiting max connections.
 */
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // SSL is required for Supabase connections
      ssl: { rejectUnauthorized: false },
      // Low max connection count is better for serverless environments
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}
