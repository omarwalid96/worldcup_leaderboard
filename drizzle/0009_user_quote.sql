-- Add optional quote/tagline to user profiles (shown on home leader spotlight).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS quote text;
