-- Migration to add lfg_channel_id column to guild_settings table
ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS lfg_channel_id VARCHAR(255); 