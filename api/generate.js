import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { validateCVInput } from "../lib/validator.js";
import { getPool } from "../lib/db.js";
import { uploadPdf } from "../lib/storage.js";

// ── ESM __dirname shim ───────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Handlebars Setup ─────────────────────────────────────────
Handlebars.registerHelper("join", (arr, separator) => {
  if (!Array.isArray(arr)) return "";
  return arr.join(separator);
});

Handlebars.registerHelper("eq", (a, b) => a === b);

const templatePath = path.resolve(__dirname, "../templates/cv.hbs");
const templateSource = fs.readFileSync(templatePath, "utf-8");
const compiledTemplate = Handlebars.compile(templateSource);

// ── Environment Detection ────────────────────────────────────
const IS_LOCAL = process.env.NODE_ENV !== "production" && !process.env.VERCEL;

async function launchBrowser() {
  if (IS_LOCAL) {
    const localChromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];
    const executablePath = localChromePaths.find((p) => fs.existsSync(p));
    return puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

/**
 * POST /api/generate
 * Flow: Validate -> Generate PDF -> Upload Storage -> Save DB Transaction -> Return
 */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let browser = null;
  const pool = getPool();
  const dbClient = await pool.connect();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { data, errors } = validateCVInput(body);
    if (errors) {
      return res.status(422).json({ error: "Validation failed", details: errors });
    }

    // Default layout
    if (!data.layout || !Array.isArray(data.layout)) {
      data.layout = ["summary", "experience", "projects", "skills", "certifications", "education"];
    }

    // ── 1. Generate PDF ──
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(compiledTemplate(data), { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: false,
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    });
    await browser.close();
    browser = null;

    // ── 2. Upload to Storage ──
    const cvId = crypto.randomUUID();
    const fileName = `cv-${cvId}.pdf`;
    const { publicUrl, signedUrl } = await uploadPdf(Buffer.from(pdfBuffer), fileName);
    const pdfUrl = publicUrl ?? signedUrl;

    // ── 3. DB Transaction ──
    await dbClient.query("BEGIN");

    // 3a. Upsert user by email (Create if not exists, Update if exists)
    const userResult = await dbClient.query(
      `INSERT INTO users (id, name, email, phone, location)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, phone = EXCLUDED.phone, location = EXCLUDED.location
       RETURNING id`,
      [
        crypto.randomUUID(),
        data.personal.name,
        data.personal.email,
        data.personal.phone || null,
        data.personal.location || null
      ]
    );
    const userId = userResult.rows[0].id;

    const cvTitle = body.cv_title || `CV - ${data.personal.name}`;

    // 3b. Insert CV Document
    await dbClient.query(
      "INSERT INTO cv_documents (id, user_id, title, pdf_url) VALUES ($1, $2, $3, $4)",
      [cvId, userId, cvTitle, pdfUrl]
    );

    // 3c. Personal Info
    await dbClient.query(
      `INSERT INTO personal_info (id, cv_id, job_title, summary)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), cvId, data.personal.title || null, data.summary || null]
    );

    // 3d. Experience
    for (const exp of (data.experience || [])) {
      const expId = crypto.randomUUID();
      await dbClient.query(
        `INSERT INTO experiences (id, cv_id, company, position, location, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [expId, cvId, exp.company, exp.title, exp.location || null, exp.start_date || null, exp.end_date || null]
      );
      // Bullets
      for (let i = 0; i < (exp.bullets || []).length; i++) {
        await dbClient.query(
          `INSERT INTO experience_bullets (id, experience_id, description, order_index)
           VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), expId, exp.bullets[i], i]
        );
      }
    }

    // 3e. Education
    for (const edu of (data.education || [])) {
      await dbClient.query(
        `INSERT INTO educations (id, cv_id, institution, degree, start_date, end_date, gpa)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), cvId, edu.institution, edu.degree, edu.start_date || null, edu.graduation_year || null, edu.gpa || null]
      );
    }

    // 3f. Skills
    for (const skillGroup of (data.skills || [])) {
      for (const skillName of (skillGroup.items || [])) {
        await dbClient.query(
          `INSERT INTO skills (id, cv_id, name, category)
           VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), cvId, skillName, skillGroup.name || null]
        );
      }
    }

    // 3g. Projects
    for (const proj of (data.projects || [])) {
      const projId = crypto.randomUUID();
      await dbClient.query(
        `INSERT INTO projects (id, cv_id, name, description, url, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [projId, cvId, proj.name, proj.description || null, proj.link || null, proj.start_date || null, proj.end_date || null]
      );
      // Bullets
      for (let i = 0; i < (proj.bullets || []).length; i++) {
        await dbClient.query(
          `INSERT INTO project_bullets (id, project_id, description, order_index)
           VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), projId, proj.bullets[i], i]
        );
      }
    }

    // 3h. Certifications
    for (const cert of (data.certifications || [])) {
      await dbClient.query(
        `INSERT INTO certifications (id, cv_id, name, issuer, issued_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), cvId, cert.name, cert.issuer || null, cert.year || null]
      );
    }

    // 3i. Custom Sections
    for (const cs of (data.custom_sections || [])) {
      const csId = crypto.randomUUID();
      await dbClient.query(
        `INSERT INTO custom_sections (id, cv_id, section_id, title)
         VALUES ($1, $2, $3, $4)`,
        [csId, cvId, cs.id, cs.title]
      );
      // Custom Bullets
      for (let i = 0; i < (cs.bullets || []).length; i++) {
        await dbClient.query(
          `INSERT INTO custom_section_bullets (id, custom_section_id, description, order_index)
           VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), csId, cs.bullets[i], i]
        );
      }
    }

    await dbClient.query("COMMIT");

    return res.status(200).json({
      success: true,
      cv_id: cvId,
      pdf_url: pdfUrl,
      download_url: signedUrl || pdfUrl
    });

  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    console.error("[generate] Error:", err);
    return res.status(500).json({ 
      error: "Failed to process CV", 
      message: IS_LOCAL ? err.message : undefined 
    });
  } finally {
    dbClient.release();
    if (browser) await browser.close();
  }
}
