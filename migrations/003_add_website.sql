-- Add website to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
