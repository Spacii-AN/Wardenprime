-- Migration: Create guild_permission_roles table
-- Description: Stores permission role configuration for guilds

-- Create the table to store guild permission roles
CREATE TABLE IF NOT EXISTS guild_permission_roles (
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

-- Add comment to the table for TablePlus documentation
COMMENT ON TABLE guild_permission_roles IS 'Stores permission roles for Discord guilds (admin, moderator, etc.)';
COMMENT ON COLUMN guild_permission_roles.guild_id IS 'Discord guild/server ID';
COMMENT ON COLUMN guild_permission_roles.roles IS 'JSON object mapping permission types to arrays of role IDs';

-- Create a migration record if migration_logs table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'migration_logs') THEN
        INSERT INTO migration_logs (name, description, executed_at)
        VALUES (
            'create_permission_roles_table',
            'Creates the guild_permission_roles table for storing permission role configuration',
            NOW()
        );
    END IF;
END
$$; 