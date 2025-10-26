-- Add node_name field to fissure_notifications table
ALTER TABLE fissure_notifications ADD COLUMN IF NOT EXISTS node_name VARCHAR(255);

-- Add index for faster node lookups
CREATE INDEX IF NOT EXISTS idx_fissure_notifications_node_name ON fissure_notifications(node_name);

-- Add composite index for mission type + node + steel path lookups
CREATE INDEX IF NOT EXISTS idx_fissure_notifications_mission_node_steel ON fissure_notifications(mission_type, node_name, steel_path);
