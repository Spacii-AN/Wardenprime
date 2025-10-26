-- Add host_id field to giveaways table
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS host_id VARCHAR(255);

-- Add index for faster host lookups
CREATE INDEX IF NOT EXISTS idx_giveaways_host_id ON giveaways(host_id);
