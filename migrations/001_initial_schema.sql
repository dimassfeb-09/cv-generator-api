-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CV Documents Table
CREATE TABLE IF NOT EXISTS cv_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pdf_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cv_user_id ON cv_documents(user_id);

-- 3. Personal Info (1:1 with CV)
CREATE TABLE IF NOT EXISTS personal_info (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL UNIQUE REFERENCES cv_documents(id) ON DELETE CASCADE,
  job_title TEXT,
  summary TEXT
);

-- 4. Experiences
CREATE TABLE IF NOT EXISTS experiences (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  location TEXT,
  start_date TEXT,
  end_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_exp_cv_id ON experiences(cv_id);

-- 5. Experience Bullets
CREATE TABLE IF NOT EXISTS experience_bullets (
  id UUID PRIMARY KEY,
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exp_bullets_id ON experience_bullets(experience_id);

-- 6. Educations
CREATE TABLE IF NOT EXISTS educations (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  gpa TEXT
);
CREATE INDEX IF NOT EXISTS idx_edu_cv_id ON educations(cv_id);

-- 7. Skills
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_skills_cv_id ON skills(cv_id);

-- 8. Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  start_date TEXT,
  end_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_proj_cv_id ON projects(cv_id);

-- 9. Project Bullets
CREATE TABLE IF NOT EXISTS project_bullets (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_proj_bullets_id ON project_bullets(project_id);

-- 10. Certifications
CREATE TABLE IF NOT EXISTS certifications (
  id UUID PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  issued_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_cert_cv_id ON certifications(cv_id);
