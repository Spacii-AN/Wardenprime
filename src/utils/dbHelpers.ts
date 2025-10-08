import { User, Guild } from 'discord.js';
import { pgdb } from '../services/postgresDatabase';
import { logger } from './logger';

/**
 * Ensures a user exists in the database
 * @param user Discord User object
 */
export async function ensureUserExists(user: User): Promise<void> {
  if (!pgdb) return;
  
  try {
    const userExists = await pgdb.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      [user.id]
    );
    
    if (userExists.length === 0) {
      logger.debug(`Creating new user in DB: ${user.tag} (${user.id})`);
      await pgdb.query(
        'INSERT INTO users (id, username, discriminator, avatar) VALUES ($1, $2, $3, $4)',
        [user.id, user.username, user.discriminator || '0', user.avatar]
      );
    } else {
      // Update user info in case it changed
      await pgdb.query(
        'UPDATE users SET username = $1, discriminator = $2, avatar = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [user.username, user.discriminator || '0', user.avatar, user.id]
      );
    }
  } catch (error) {
    logger.error(`Error ensuring user exists: ${user.id}`, error);
  }
}

/**
 * Ensures a guild exists in the database
 * @param guild Discord Guild object
 */
export async function ensureGuildExists(guild: Guild): Promise<void> {
  if (!pgdb) return;
  
  try {
    const guildExists = await pgdb.query<{ id: string }>(
      'SELECT id FROM guilds WHERE id = $1',
      [guild.id]
    );
    
    if (guildExists.length === 0) {
      logger.debug(`Creating new guild in DB: ${guild.name} (${guild.id})`);
      await pgdb.query(
        'INSERT INTO guilds (id, name, icon, owner_id, member_count) VALUES ($1, $2, $3, $4, $5)',
        [guild.id, guild.name, guild.icon, guild.ownerId, guild.memberCount]
      );
    } else {
      // Update guild info in case it changed
      await pgdb.query(
        'UPDATE guilds SET name = $1, icon = $2, owner_id = $3, member_count = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
        [guild.name, guild.icon, guild.ownerId, guild.memberCount, guild.id]
      );
    }
  } catch (error) {
    logger.error(`Error ensuring guild exists: ${guild.id}`, error);
  }
} 