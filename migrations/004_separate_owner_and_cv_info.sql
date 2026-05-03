-- 1. Add CV-specific personal info columns to personal_info table
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS github TEXT;
ALTER TABLE personal_info ADD COLUMN IF NOT EXISTS website TEXT;

-- 2. (Optional) We keep the users table as is, but it now represents the 'Account' that owns the CV.
-- The personal_info table will store the actual data displayed on the CV.
