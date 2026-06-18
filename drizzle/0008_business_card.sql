-- Optional business card image per user. Editable only directly in the DB
-- (no app UI). When NULL the profile shows no business-card section.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_card_url text;
