-- Create backup table to store snapshots of deleted CVs
CREATE TABLE IF NOT EXISTS cv_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cv_id UUID,
    owner_email TEXT NOT NULL,
    original_data JSONB NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_by TEXT -- Can be the owner_email or admin
);

-- Index for faster audit lookup
CREATE INDEX IF NOT EXISTS idx_cv_backup_owner ON cv_backup(owner_email);
CREATE INDEX IF NOT EXISTS idx_cv_backup_cv_id ON cv_backup(cv_id);
