-- 1. Add technologies to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technologies TEXT[];

-- 2. Add content to custom_sections table
ALTER TABLE custom_sections ADD COLUMN IF NOT EXISTS content TEXT;
