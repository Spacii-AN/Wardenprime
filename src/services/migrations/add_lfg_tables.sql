-- Migration to add LFG sessions table
CREATE TABLE IF NOT EXISTS lfg_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id VARCHAR(255) NOT NULL,
  thread_id VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  host_id VARCHAR(255) NOT NULL,
  mission_name TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 1,
  max_players INTEGER NOT NULL DEFAULT 4,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_lfg_sessions_guild_id ON lfg_sessions(guild_id);
CREATE INDEX IF NOT EXISTS idx_lfg_sessions_host_id ON lfg_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_lfg_sessions_status ON lfg_sessions(status);

-- Create table for tracking LFG participants
CREATE TABLE IF NOT EXISTS lfg_participants (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES lfg_sessions(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lfg_participants_session_id ON lfg_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_lfg_participants_user_id ON lfg_participants(user_id); 