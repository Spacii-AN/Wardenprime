-- Custom Embeds and Templates Tables
-- This migration creates tables for storing custom embeds and templates

-- Custom embeds table for queued embeds
CREATE TABLE IF NOT EXISTS custom_embeds (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL,
    embed_data JSONB NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    message_id VARCHAR(255),
    error_message TEXT
);

-- Embed templates table for saving reusable embed designs
CREATE TABLE IF NOT EXISTS embed_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    embed_data JSONB NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_embeds_channel_id ON custom_embeds(channel_id);
CREATE INDEX IF NOT EXISTS idx_custom_embeds_status ON custom_embeds(status);
CREATE INDEX IF NOT EXISTS idx_custom_embeds_created_by ON custom_embeds(created_by);
CREATE INDEX IF NOT EXISTS idx_embed_templates_created_by ON embed_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_embed_templates_name ON embed_templates(name);

-- Add some sample templates
INSERT INTO embed_templates (name, embed_data, created_by) VALUES 
('Welcome Message', '{"title": "Welcome to the Server!", "description": "Welcome to our amazing community! Please read the rules and enjoy your stay.", "color": "#00ff00", "footer": "Welcome Team", "timestamp": true}', 'system'),
('Announcement', '{"title": "📢 Important Announcement", "description": "We have an important update to share with everyone.", "color": "#ff6b6b", "footer": "Server Staff", "timestamp": true}', 'system'),
('Guide Header', '{"title": "📖 Guide: Getting Started", "description": "This guide will help you get started with our server.", "color": "#4ecdc4", "footer": "Guide Team", "timestamp": true}', 'system')
ON CONFLICT DO NOTHING;
