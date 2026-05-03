-- Add layout column to cv_documents to store section order
ALTER TABLE cv_documents ADD COLUMN IF NOT EXISTS layout TEXT[];
