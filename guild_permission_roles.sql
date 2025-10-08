-- Script to create the guild_permission_roles table
-- Run this directly in TablePlus

-- First, ensure the public schema exists
CREATE SCHEMA IF NOT EXISTS public;

-- Create the guild_permission_roles table
CREATE TABLE IF NOT EXISTS public.guild_permission_roles (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    -- Store roles as JSONB for flexibility and querying capabilities
    roles JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Ensure only one record per guild
    CONSTRAINT guild_permission_roles_guild_id_unique UNIQUE (guild_id)
);

-- Add index on guild_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_permission_roles_guild_id ON guild_permission_roles(guild_id);

-- Add documentation comments
COMMENT ON TABLE guild_permission_roles IS 'Stores permission roles for Discord guilds (admin, moderator, etc.)';
COMMENT ON COLUMN guild_permission_roles.guild_id IS 'Discord guild/server ID';
COMMENT ON COLUMN guild_permission_roles.roles IS 'JSON object mapping permission types to arrays of role IDs';
COMMENT ON COLUMN guild_permission_roles.created_at IS 'Timestamp when this record was created';
COMMENT ON COLUMN guild_permission_roles.updated_at IS 'Timestamp when this record was last updated';

-- Sample insert statement (uncomment and modify as needed)
-- INSERT INTO guild_permission_roles (guild_id, roles)
-- VALUES ('123456789012345678', '{"admin":["111111111111111111"], "moderator":["222222222222222222"]}'::JSONB);

-- Sample query to retrieve permissions for a guild
-- SELECT * FROM guild_permission_roles WHERE guild_id = '123456789012345678';

-- Sample update statement to add a role
-- UPDATE guild_permission_roles 
-- SET roles = jsonb_set(roles, '{admin}', roles->'admin' || '"333333333333333333"'::jsonb),
--     updated_at = NOW()
-- WHERE guild_id = '123456789012345678'; 