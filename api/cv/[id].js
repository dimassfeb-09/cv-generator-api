import { getPool } from "../../lib/db.js";
import { getSignedUrl } from "../../lib/storage.js";

/**
 * GET /api/cv/[id]
 * Fetches complete CV data from PostgreSQL by cv_id.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "cv_id is required" });

  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    // 1. Fetch CV doc and Personal Info
    const cvResult = await dbClient.query(
      `SELECT cv.*, pi.job_title, pi.summary, u.name as user_name, u.email as user_email
       FROM cv_documents cv
       JOIN users u ON u.id = cv.user_id
       LEFT JOIN personal_info pi ON pi.cv_id = cv.id
       WHERE cv.id = $1`,
      [id]
    );

    if (cvResult.rows.length === 0) {
      return res.status(404).json({ error: "CV not found" });
    }

    const cvData = cvResult.rows[0];

    // 2. Generate a fresh signed URL for the PDF
    const fileName = `cv-${id}.pdf`;
    let freshDownloadUrl = cvData.pdf_url;
    
    try {
      const { signedUrl } = await getSignedUrl(fileName);
      freshDownloadUrl = signedUrl;
    } catch (storageErr) {
      console.warn("[GET CV] Storage link refresh failed, falling back to public URL");
    }

    // 3. Fetch all related entities in parallel
    const [expRes, eduRes, skillRes, projRes, certRes, customRes] = await Promise.all([
      dbClient.query(
        `SELECT e.*, 
                (SELECT json_agg(b.description ORDER BY b.order_index) 
                 FROM experience_bullets b WHERE b.experience_id = e.id) as bullets
         FROM experiences e WHERE e.cv_id = $1`, [id]
      ),
      dbClient.query(`SELECT * FROM educations WHERE cv_id = $1`, [id]),
      dbClient.query(`SELECT * FROM skills WHERE cv_id = $1`, [id]),
      dbClient.query(
        `SELECT p.*, 
                (SELECT json_agg(b.description ORDER BY b.order_index) 
                 FROM project_bullets b WHERE b.project_id = p.id) as bullets
         FROM projects p WHERE p.cv_id = $1`, [id]
      ),
      dbClient.query(`SELECT * FROM certifications WHERE cv_id = $1`, [id]),
      dbClient.query(
        `SELECT cs.*, 
                (SELECT json_agg(b.description ORDER BY b.order_index) 
                 FROM custom_section_bullets b WHERE b.custom_section_id = cs.id) as bullets
         FROM custom_sections cs WHERE cs.cv_id = $1`, [id]
      )
    ]);

    // 4. Construct response
    return res.status(200).json({
      success: true,
      data: {
        cv_id: cvData.id,
        title: cvData.title,
        pdf_url: cvData.pdf_url,
        download_url: freshDownloadUrl,
        personal: {
          name: cvData.user_name,
          email: cvData.user_email,
          title: cvData.job_title,
          summary: cvData.summary
        },
        experience: expRes.rows,
        education: eduRes.rows,
        skills: skillRes.rows,
        projects: projRes.rows,
        certifications: certRes.rows,
        custom_sections: customRes.rows,
        created_at: cvData.created_at
      }
    });

  } catch (err) {
    console.error("[GET CV] Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
}
