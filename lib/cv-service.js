/**
 * Helper to fetch full CV data for backup or display
 */
export async function getFullCVData(dbClient, cvId) {
  // 1. Fetch main CV and Personal Info
  const cvResult = await dbClient.query(
    `SELECT cv.*, u.email as owner_email,
            pi.name as personal_name, pi.email as personal_email, pi.phone as personal_phone,
            pi.location as personal_location, pi.linkedin as personal_linkedin,
            pi.github as personal_github, pi.website as personal_website,
            pi.job_title, pi.summary
     FROM cv_documents cv
     JOIN users u ON u.id = cv.user_id
     LEFT JOIN personal_info pi ON pi.cv_id = cv.id
     WHERE cv.id = $1`,
    [cvId]
  );

  if (cvResult.rows.length === 0) return null;
  const cvData = cvResult.rows[0];

  // 2. Fetch all related entities
  const [expRes, eduRes, skillRes, projRes, certRes, customRes] = await Promise.all([
    dbClient.query(
      `SELECT e.id, e.company, e.position as title, e.location, e.start_date, e.end_date,
              (SELECT json_agg(b.description ORDER BY b.order_index) 
               FROM experience_bullets b WHERE b.experience_id = e.id) as bullets
       FROM experiences e WHERE e.cv_id = $1`, [cvId]
    ),
    dbClient.query(`SELECT * FROM educations WHERE cv_id = $1`, [cvId]),
    dbClient.query(`SELECT * FROM skills WHERE cv_id = $1`, [cvId]),
    dbClient.query(
      `SELECT p.id, p.name, p.description, p.url as link, p.start_date, p.end_date, p.technologies,
              (SELECT json_agg(b.description ORDER BY b.order_index) 
               FROM project_bullets b WHERE b.project_id = p.id) as bullets
       FROM projects p WHERE p.cv_id = $1`, [cvId]
    ),
    dbClient.query(`SELECT id, name, issuer, issued_date as year FROM certifications WHERE cv_id = $1`, [cvId]),
    dbClient.query(
      `SELECT cs.section_id as id, cs.title, cs.content,
              (SELECT json_agg(b.description ORDER BY b.order_index) 
               FROM custom_section_bullets b WHERE b.custom_section_id = cs.id) as bullets
       FROM custom_sections cs WHERE cs.cv_id = $1`, [cvId]
    )
  ]);

  // 3. Group Skills
  const groupedSkills = [];
  const skillMap = {};
  for (const s of skillRes.rows) {
    const cat = s.category || "General";
    if (!skillMap[cat]) {
      skillMap[cat] = [];
      groupedSkills.push({ name: cat, items: skillMap[cat] });
    }
    skillMap[cat].push(s.name);
  }

  return {
    cv_id: cvData.id,
    title: cvData.title,
    pdf_url: cvData.pdf_url,
    owner_email: cvData.owner_email,
    layout: cvData.layout || [],
    personal: {
      name: cvData.personal_name,
      email: cvData.personal_email,
      phone: cvData.personal_phone,
      location: cvData.personal_location,
      linkedin: cvData.personal_linkedin,
      github: cvData.personal_github,
      website: cvData.personal_website,
      title: cvData.job_title
    },
    summary: cvData.summary,
    experience: expRes.rows,
    education: eduRes.rows,
    skills: groupedSkills,
    projects: projRes.rows,
    certifications: certRes.rows,
    custom_sections: customRes.rows,
    created_at: cvData.created_at
  };
}
