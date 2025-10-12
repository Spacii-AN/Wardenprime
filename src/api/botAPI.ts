import express from 'express';
import { Client } from 'discord.js';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { pgdb } from '../services/postgresDatabase';
import { getGuildPermissionRoles } from '../services/permissionService';

export interface BotAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export function createBotAPI(client: Client) {
  const app = express();
  app.use(express.json());

  // Middleware to validate API key (simple for now)
  const validateAPIKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || apiKey !== config.DASHBOARD_SESSION_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
  };

  // Bot Status Endpoints
  app.get('/api/bot/status', validateAPIKey, (req: express.Request, res: express.Response) => {
    try {
      const status = {
        online: client.isReady(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
        ping: client.ws.ping,
        services: {
          arbitrations: true, // TODO: Get from actual service status
          aya: true,
          baro: true,
          fissures: true,
          incarnon: true
        }
      };
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error getting bot status:', error);
      res.status(500).json({ success: false, error: 'Failed to get bot status' });
    }
  });

  // Service Control Endpoints
  app.post('/api/bot/services/toggle', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      const { service, enabled } = req.body;
      
      // TODO: Implement actual service toggling
      logger.info(`Toggling service ${service} to ${enabled}`);
      
      // For now, just log the action
      // In a real implementation, you'd:
      // 1. Update service configuration in database
      // 2. Start/stop the actual service
      // 3. Update Discord status/activity
      
      res.json({ success: true, data: { service, enabled } });
    } catch (error) {
      logger.error('Error toggling service:', error);
      res.status(500).json({ success: false, error: 'Failed to toggle service' });
    }
  });

  // Dictionary Update Endpoint
  app.post('/api/bot/dictionary/update', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      logger.info('Manual dictionary update triggered via API');
      
      // TODO: Trigger actual dictionary update service
      // This would call the dictionaryUpdater service
      
      res.json({ success: true, data: { message: 'Dictionary update initiated' } });
    } catch (error) {
      logger.error('Error updating dictionaries:', error);
      res.status(500).json({ success: false, error: 'Failed to update dictionaries' });
    }
  });

  // Guild Management Endpoints
  app.get('/api/bot/guilds', validateAPIKey, (req: express.Request, res: express.Response) => {
    try {
      const guilds = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        icon: guild.iconURL()
      }));
      
      res.json({ success: true, data: guilds });
    } catch (error) {
      logger.error('Error getting guilds:', error);
      res.status(500).json({ success: false, error: 'Failed to get guilds' });
    }
  });

  app.get('/api/bot/guild/:guildId/channels', validateAPIKey, (req: express.Request, res: express.Response) => {
    try {
      const guildId = req.params.guildId;
      const guild = client.guilds.cache.get(guildId);
      
      if (!guild) {
        return res.status(404).json({ success: false, error: 'Guild not found' });
      }

      const channels = guild.channels.cache
        .filter(channel => channel.isTextBased())
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId
        }));
      
      res.json({ success: true, data: channels });
    } catch (error) {
      logger.error('Error getting channels:', error);
      res.status(500).json({ success: false, error: 'Failed to get channels' });
    }
  });

  // Notification Settings Endpoints
  app.get('/api/bot/notifications', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      // TODO: Get from database
      const notifications = {
        arbitrations: { enabled: true, channelId: null as string | null },
        aya: { enabled: true, channelId: null as string | null },
        baro: { enabled: true, channelId: null as string | null },
        fissures: { enabled: true, channelId: null as string | null },
        incarnon: { enabled: true, channelId: null as string | null }
      };
      
      res.json({ success: true, data: notifications });
    } catch (error) {
      logger.error('Error getting notifications:', error);
      res.status(500).json({ success: false, error: 'Failed to get notifications' });
    }
  });

  app.post('/api/bot/notifications', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      const { service, enabled, channelId } = req.body;
      
      // TODO: Save to database
      logger.info(`Updating notification settings for ${service}: enabled=${enabled}, channel=${channelId}`);
      
      res.json({ success: true, data: { service, enabled, channelId } });
    } catch (error) {
      logger.error('Error updating notifications:', error);
      res.status(500).json({ success: false, error: 'Failed to update notifications' });
    }
  });

  // Warframe Catalog Endpoints
  app.get('/api/bot/warframes', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      if (config.DATABASE_TYPE === 'postgres' && pgdb) {
        // TODO: Implement getWarframes method in postgresDatabase
        res.json({ success: true, data: [] });
      } else {
        res.json({ success: true, data: [] });
      }
    } catch (error) {
      logger.error('Error getting warframes:', error);
      res.status(500).json({ success: false, error: 'Failed to get warframes' });
    }
  });

  app.post('/api/bot/warframes', validateAPIKey, async (req: express.Request, res: express.Response) => {
    try {
      const { name, craftingCostCredits, resourceMap, notes, createdBy } = req.body;
      
      if (config.DATABASE_TYPE === 'postgres' && pgdb) {
        // TODO: Implement createWarframe method in postgresDatabase
        res.json({ success: false, error: 'Database not available' });
      } else {
        res.json({ success: false, error: 'Database not available' });
      }
    } catch (error) {
      logger.error('Error creating warframe:', error);
      res.status(500).json({ success: false, error: 'Failed to create warframe' });
    }
  });

  // Error handling middleware
  app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Bot API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

export function startBotAPI(client: Client, port: number = 3081) {
  const app = createBotAPI(client);
  
  app.listen(port, () => {
    logger.info(`Bot API server listening on port ${port}`);
  });
  
  return app;
}
