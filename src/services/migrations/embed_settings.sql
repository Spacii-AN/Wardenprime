-- Migration: Add embed settings table for dashboard customization
-- This allows admins to customize default embed colors, footer, and author settings

CREATE TABLE IF NOT EXISTS embed_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL,
    setting_name VARCHAR(50) NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) NOT NULL DEFAULT 'string', -- string, number, boolean, color
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, setting_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_embed_settings_guild_id ON embed_settings(guild_id);
CREATE INDEX IF NOT EXISTS idx_embed_settings_name ON embed_settings(setting_name);

-- Insert default settings for all guilds (global defaults)
-- These will be used as fallbacks when guild-specific settings don't exist
INSERT INTO embed_settings (guild_id, setting_name, setting_value, setting_type, description) VALUES
('global', 'primary_color', '#5865F2', 'color', 'Primary embed color (Discord Blurple)'),
('global', 'success_color', '#57F287', 'color', 'Success embed color (Green)'),
('global', 'error_color', '#ED4245', 'color', 'Error embed color (Red)'),
('global', 'warning_color', '#FEE75C', 'color', 'Warning embed color (Yellow)'),
('global', 'info_color', '#5865F2', 'color', 'Info embed color (Discord Blurple)'),
('global', 'default_footer', 'Powered by WardenPrime', 'string', 'Default footer text for embeds'),
('global', 'default_author_name', 'WardenPrime', 'string', 'Default author name for embeds'),
('global', 'default_author_icon', 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png', 'string', 'Default author icon URL'),
('global', 'default_author_url', '', 'string', 'Default author URL (optional)'),
('global', 'show_timestamp', 'true', 'boolean', 'Whether to show timestamp by default'),
('global', 'show_author', 'true', 'boolean', 'Whether to show author by default')
ON CONFLICT (guild_id, setting_name) DO NOTHING;

-- Create a function to get embed settings with fallback to global defaults
CREATE OR REPLACE FUNCTION get_embed_setting(
    p_guild_id VARCHAR(20),
    p_setting_name VARCHAR(50)
) RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    -- First try to get guild-specific setting
    SELECT setting_value INTO result
    FROM embed_settings
    WHERE guild_id = p_guild_id AND setting_name = p_setting_name;
    
    -- If not found, try global default
    IF result IS NULL THEN
        SELECT setting_value INTO result
        FROM embed_settings
        WHERE guild_id = 'global' AND setting_name = p_setting_name;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get all embed settings for a guild (with global fallbacks)
CREATE OR REPLACE FUNCTION get_all_embed_settings(p_guild_id VARCHAR(20))
RETURNS TABLE(setting_name VARCHAR(50), setting_value TEXT, setting_type VARCHAR(20)) AS $$
BEGIN
    RETURN QUERY
    WITH guild_settings AS (
        SELECT setting_name, setting_value, setting_type
        FROM embed_settings
        WHERE guild_id = p_guild_id
    ),
    global_settings AS (
        SELECT setting_name, setting_value, setting_type
        FROM embed_settings
        WHERE guild_id = 'global'
    )
    SELECT 
        COALESCE(gs.setting_name, gls.setting_name) as setting_name,
        COALESCE(gs.setting_value, gls.setting_value) as setting_value,
        COALESCE(gs.setting_type, gls.setting_type) as setting_type
    FROM global_settings gls
    LEFT JOIN guild_settings gs ON gls.setting_name = gs.setting_name
    ORDER BY gls.setting_name;
END;
$$ LANGUAGE plpgsql;
