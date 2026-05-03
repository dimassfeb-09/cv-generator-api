-- Add linkedin and github to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github TEXT;
