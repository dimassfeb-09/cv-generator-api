import { z } from "zod";

// ── Sub-schemas (All Optional by default) ────────────────────

const PersonalSchema = z.object({
  name: z.string().min(1, "personal.name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  title: z.string().optional().or(z.literal("")),
  linkedin: z.string().optional().or(z.literal("")),
  github: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  location: z.string().optional().or(z.literal("")),
});

const ExperienceSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});

const EducationSchema = z.object({
  degree: z.string().optional(),
  institution: z.string().optional(),
  location: z.string().optional(),
  graduation_year: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  gpa: z.union([z.string(), z.number()]).transform(v => v.toString()).optional(),
});

const SkillGroupSchema = z.object({
  name: z.string().optional(),
  items: z.array(z.string()).default([]),
});

const ProjectSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  link: z.string().regex(/^(https?:\/\/|www\.)/i, "Invalid URL protocol").optional().or(z.literal("")),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});

const CertificationSchema = z.object({
  name: z.string().optional(),
  issuer: z.string().optional(),
  year: z.string().optional(),
});

// Custom Section Schema with content support
const CustomSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  bullets: z.array(z.string()).optional().default([]),
  content: z.string().optional(), // For simple text paragraphs
});

// ── Root Schema ──────────────────────────────────────────────

const CVSchema = z.object({
  owner_email: z.string().email().optional(), // The email of the account that owns the CV
  personal: PersonalSchema,
  summary: z.string().optional().or(z.literal("")),
  experience: z.array(ExperienceSchema).optional().default([]),
  projects: z.array(ProjectSchema).optional().default([]),
  education: z.array(EducationSchema).optional().default([]),
  skills: z.array(SkillGroupSchema).optional().default([]),
  certifications: z.array(CertificationSchema).default([]),
  custom_sections: z.array(CustomSectionSchema).default([]),
}).passthrough().refine((data) => {
  if (!data.custom_sections) return true;
  const ids = data.custom_sections.map(s => s.id);
  return new Set(ids).size === ids.length;
}, {
  message: "Custom section IDs must be unique",
  path: ["custom_sections"]
});

export function validateCVInput(raw) {
  const result = CVSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { data: null, errors };
  }

  return { data: result.data, errors: null };
}
