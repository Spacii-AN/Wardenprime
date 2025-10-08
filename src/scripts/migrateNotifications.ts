import fs from 'fs';
import path from 'path';
import { pgdb } from '../services/postgresDatabase';
import { logger } from '../utils/logger';
import { initDatabase } from '../services/initDatabase';

interface FissureNotification {
  guildId: string;
  channelId: string;
  missionType: string;
  steelPath: boolean;
  roleId?: string;
  lastNotified?: string;
  createdAt: string;
  updatedAt: string;
}

interface ChannelNotification {
  guildId: string;
  channelId: string;
  roleId?: string;
  messageId?: string;
  createdAt: string;
  updatedAt: string;
}

async function migrateNotifications() {
  try {
    logger.info('Starting notification migration from JSON to PostgreSQL...');
    
    // Initialize database
    await initDatabase();
    
    // Migrate Fissure Notifications
    const fissurePath = path.join(process.cwd(), 'data', 'fissureNotifications.json');
    if (fs.existsSync(fissurePath)) {
      const fissureData: FissureNotification[] = JSON.parse(fs.readFileSync(fissurePath, 'utf8'));
      logger.info(`Found ${fissureData.length} fissure notifications to migrate`);
      
      for (const notification of fissureData) {
        await pgdb.query(
          `INSERT INTO fissure_notifications 
           (guild_id, channel_id, mission_type, steel_path, role_id, last_notified, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [
            notification.guildId,
            notification.channelId,
            notification.missionType,
            notification.steelPath,
            notification.roleId || null,
            notification.lastNotified || null,
            new Date(notification.createdAt),
            new Date(notification.updatedAt)
          ]
        );
      }
      logger.info('Fissure notifications migrated successfully');
    }
    
    // Migrate Aya Notifications
    const ayaPath = path.join(process.cwd(), 'data', 'ayaChannels.json');
    if (fs.existsSync(ayaPath)) {
      const ayaData: ChannelNotification[] = JSON.parse(fs.readFileSync(ayaPath, 'utf8'));
      logger.info(`Found ${ayaData.length} aya notifications to migrate`);
      
      for (const notification of ayaData) {
        await pgdb.query(
          `INSERT INTO aya_notifications 
           (guild_id, channel_id, role_id, message_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            notification.guildId,
            notification.channelId,
            notification.roleId || null,
            notification.messageId || null,
            new Date(notification.createdAt),
            new Date(notification.updatedAt)
          ]
        );
      }
      logger.info('Aya notifications migrated successfully');
    }
    
    // Migrate Baro Notifications
    const baroPath = path.join(process.cwd(), 'data', 'baroChannels.json');
    if (fs.existsSync(baroPath)) {
      const baroData: ChannelNotification[] = JSON.parse(fs.readFileSync(baroPath, 'utf8'));
      logger.info(`Found ${baroData.length} baro notifications to migrate`);
      
      for (const notification of baroData) {
        await pgdb.query(
          `INSERT INTO baro_notifications 
           (guild_id, channel_id, role_id, message_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            notification.guildId,
            notification.channelId,
            notification.roleId || null,
            notification.messageId || null,
            new Date(notification.createdAt),
            new Date(notification.updatedAt)
          ]
        );
      }
      logger.info('Baro notifications migrated successfully');
    }
    
    // Migrate Arbitration Notifications
    const arbyPath = path.join(process.cwd(), 'data', 'arbyChannels.json');
    if (fs.existsSync(arbyPath)) {
      const arbyData: ChannelNotification[] = JSON.parse(fs.readFileSync(arbyPath, 'utf8'));
      logger.info(`Found ${arbyData.length} arbitration notifications to migrate`);
      
      for (const notification of arbyData) {
        await pgdb.query(
          `INSERT INTO arbitration_notifications 
           (guild_id, channel_id, role_id, message_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            notification.guildId,
            notification.channelId,
            notification.roleId || null,
            notification.messageId || null,
            new Date(notification.createdAt),
            new Date(notification.updatedAt)
          ]
        );
      }
      logger.info('Arbitration notifications migrated successfully');
    }
    
    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during migration:', error);
    process.exit(1);
  }
}

migrateNotifications(); 