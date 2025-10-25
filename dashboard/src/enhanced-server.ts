import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import axios from 'axios';
import { Pool } from 'pg';

// Enhanced logger for dashboard
class Logger {
  info(message: string, ...args: any[]) {
    console.log(`[INFO] ${message}`, ...args);
  }
  
  warn(message: string, ...args: any[]) {
    console.warn(`[WARN] ${message}`, ...args);
  }
  
  error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }
}

const logger = new Logger();

// Enhanced configuration
const config = {
  DASHBOARD_ENABLED: process.env.DASHBOARD_ENABLED !== 'false',
  DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || '3080'),
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET || process.env.SESSION_SECRET,
  DASHBOARD_PUBLIC_URL: process.env.DASHBOARD_PUBLIC_URL,
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL,
  CLIENT_ID: process.env.CLIENT_ID,
  BOT_API_URL: process.env.BOT_API_URL || 'http://host.docker.internal:3081',
  BOT_API_KEY: process.env.BOT_API_KEY || 'dev-api-key',
  // Database configuration
  PG_HOST: process.env.PG_HOST || 'localhost',
  PG_PORT: parseInt(process.env.PG_PORT || '5432'),
  PG_DATABASE: process.env.PG_DATABASE || 'wardenprime',
  PG_USER: process.env.PG_USER || 'wardenprime',
  PG_PASSWORD: process.env.PG_PASSWORD || 'wardenprime_password',
  PG_SSL_MODE: process.env.PG_SSL_MODE || 'disable'
};

// Database connection
const dbPool = new Pool({
  host: config.PG_HOST,
  port: config.PG_PORT,
  database: config.PG_DATABASE,
  user: config.PG_USER,
  password: config.PG_PASSWORD,
  ssl: config.PG_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Enhanced Bot API client with more features
class EnhancedBotAPIClient {
  private baseURL: string;
  private apiKey: string;

  constructor(baseURL: string, apiKey: string) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Existing methods
  async getBotStatus(): Promise<any> {
    return this.request('/api/bot/status');
  }

  async toggleService(service: string, enabled: boolean): Promise<any> {
    return this.request('/api/bot/services/toggle', {
      method: 'POST',
      body: JSON.stringify({ service, enabled }),
    });
  }

  async updateDictionaries(): Promise<any> {
    return this.request('/api/bot/dictionary/update', { method: 'POST' });
  }

  async getGuilds(): Promise<any> {
    return this.request('/api/bot/guilds');
  }

  async getChannels(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/channels`);
  }

  async getNotifications(): Promise<any> {
    return this.request('/api/bot/notifications');
  }

  async updateNotifications(service: string, enabled: boolean, channelId?: string): Promise<any> {
    return this.request('/api/bot/notifications', {
      method: 'POST',
      body: JSON.stringify({ service, enabled, channelId }),
    });
  }

  // Enhanced methods for comprehensive dashboard
  async getGuildMembers(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/members`);
  }

  async getGuildRoles(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/roles`);
  }

  async getGuildSettings(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/settings`);
  }

  async updateGuildSettings(guildId: string, settings: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/settings`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getWelcomeMessages(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/welcome`);
  }

  async updateWelcomeMessage(guildId: string, message: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/welcome`, {
      method: 'POST',
      body: JSON.stringify(message),
    });
  }

  async getRoleCommands(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/role-commands`);
  }

  async createRoleCommand(guildId: string, command: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/role-commands`, {
      method: 'POST',
      body: JSON.stringify(command),
    });
  }

  async getGuildInfo(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/info`);
  }

  async sendEmbed(channelId: string, embed: any): Promise<any> {
    return this.request('/api/bot/embeds/send', {
      method: 'POST',
      body: JSON.stringify({ channelId, embed }),
    });
  }

  async updateRoleCommand(guildId: string, commandId: string, command: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/role-commands/${commandId}`, {
      method: 'PUT',
      body: JSON.stringify(command),
    });
  }

  async deleteRoleCommand(guildId: string, commandId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/role-commands/${commandId}`, {
      method: 'DELETE',
    });
  }

  async getGiveaways(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/giveaways`);
  }

  async createGiveaway(guildId: string, giveaway: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/giveaways`, {
      method: 'POST',
      body: JSON.stringify(giveaway),
    });
  }

  async endGiveaway(guildId: string, giveawayId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/giveaways/${giveawayId}/end`, {
      method: 'POST',
    });
  }

  async getFissureNotifications(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/fissure-notifications`);
  }

  async createFissureNotification(guildId: string, notification: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/fissure-notifications`, {
      method: 'POST',
      body: JSON.stringify(notification),
    });
  }

  async getAnalytics(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/analytics`);
  }

  async getLogs(guildId: string, type?: string, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (limit) params.append('limit', limit.toString());
    
    return this.request(`/api/bot/guild/${guildId}/logs?${params.toString()}`);
  }

  async getModerationActions(guildId: string): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/moderation`);
  }

  async performModerationAction(guildId: string, action: any): Promise<any> {
    return this.request(`/api/bot/guild/${guildId}/moderation`, {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }
}

// Initialize enhanced bot API client
const botAPI = new EnhancedBotAPIClient(config.BOT_API_URL, config.BOT_API_KEY);

type DiscordProfile = any;

export function startEnhancedDashboard() {
  if (!config.DASHBOARD_ENABLED) {
    logger.info('Dashboard disabled (DASHBOARD_ENABLED=false)');
    return;
  }

  if (!config.DASHBOARD_SESSION_SECRET) {
    logger.warn('DASHBOARD_SESSION_SECRET not set; refusing to start dashboard');
    return;
  }

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  
  // Serve static files
  app.use(express.static(path.join(__dirname, '../public')));

  app.use(session({
    secret: config.DASHBOARD_SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
  }));

  const oauthEnabled = !process.env.OAUTH_DISABLED && !!config.CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET;
  if (oauthEnabled) {
    const scopes = ['identify', 'guilds'];
    passport.use(new DiscordStrategy({
      clientID: config.CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      callbackURL: config.OAUTH_CALLBACK_URL || `${config.DASHBOARD_PUBLIC_URL}/auth/callback`,
      scope: scopes,
    }, (accessToken: string, refreshToken: string, profile: DiscordProfile, done: any) => {
      return done(null, { 
        id: profile.id, 
        username: profile.username, 
        discriminator: profile.discriminator, 
        guilds: profile.guilds,
        avatar: profile.avatar
      });
    }));

    passport.serializeUser((user: any, done) => done(null, user));
    passport.deserializeUser((obj: any, done) => done(null, obj));

    app.use(passport.initialize());
    app.use(passport.session());
  } else {
    // Preview mode: stub a user so views show as logged-in
    app.use((req: any, _res, next) => {
      req.user = { 
        username: 'Preview', 
        discriminator: '0000',
        id: 'preview',
        guilds: [{ id: '1431679304328151251', name: 'Test Server', permissions: '0x8' }]
      };
      next();
    });
  }

  function ensureLoggedIn(req: any, res: any, next: any) {
    if (!oauthEnabled) return next();
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    return res.redirect('/login');
  }

  async function ensureModOrAdmin(req: any, res: any, next: any) {
    try {
      // Check if user has admin permissions in any guild
      if (req.user && req.user.guilds) {
        const hasAdminGuild = req.user.guilds.some((guild: any) => 
          (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8) // Administrator permission
        );
        if (hasAdminGuild) return next();
      }
      return res.status(403).send('Insufficient permissions');
    } catch (e) {
      logger.error('AuthZ error', e);
      return res.sendStatus(403);
    }
  }

  // OAuth routes
  if (oauthEnabled) {
    app.get('/login', passport.authenticate('discord'));
    app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => {
      res.redirect('/');
    });
    app.get('/logout', (req: any, res) => {
      req.logout(() => res.redirect('/'));
    });
  } else {
    app.get('/login', (_req, res) => res.redirect('/'));
    app.get('/logout', (_req, res) => res.redirect('/'));
  }

  // Main dashboard route
  app.get('/', async (req: any, res) => {
    try {
      const ws = await axios.get('https://oracle.browse.wf/worldState.json', { timeout: 10000, headers: { 'User-Agent': 'WardenPrimeBot/1.0.0' } });
      res.render('home', { user: req.user, worldState: ws.data });
    } catch (e) {
      logger.error('World state fetch failed', e);
      res.render('home', { user: req.user, worldState: null });
    }
  });

  // Enhanced dashboard routes
  app.get('/dashboard', ensureLoggedIn, async (req: any, res) => {
    try {
      // Try to get bot status, but don't fail if bot API is not available
      let botStatus = null;
      let notifications = null;
      
      try {
        const botStatusResponse = await botAPI.getBotStatus();
        const notificationsResponse = await botAPI.getNotifications();
        
        if (botStatusResponse.success) {
          botStatus = botStatusResponse.data;
        }
        if (notificationsResponse.success) {
          notifications = notificationsResponse.data;
        }
      } catch (apiError) {
        logger.warn('Bot API not available, running in offline mode:', apiError);
        // Continue with null data - dashboard will show offline mode
      }

      res.render('dashboard/main', { 
        user: req.user, 
        botStatus: botStatus, 
        notifications: notifications,
        offlineMode: !botStatus
      });
    } catch (error) {
      logger.error('Error loading main dashboard:', error);
      res.status(500).send('Error loading dashboard');
    }
  });

  // Server selection route
  app.get('/servers', ensureLoggedIn, async (req: any, res) => {
    try {
      res.render('servers/select', { user: req.user });
    } catch (error) {
      logger.error('Error loading server selection:', error);
      res.status(500).send('Error loading server selection');
    }
  });

  // Custom Embeds route
  app.get('/servers/:guildId/embeds', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      
      // Try to get guild info from bot API
      let guild = null;
      try {
        const guildResponse = await botAPI.getGuildInfo(guildId);
        if (guildResponse.success) {
          guild = guildResponse.data;
        }
      } catch (apiError) {
        logger.warn('Bot API not available for guild info, using fallback:', apiError);
        // Fallback: Create a basic guild object
        guild = {
          id: guildId,
          name: 'Server',
          channels: []
        };
      }

      res.render('servers/custom-embeds', { 
        user: req.user, 
        guild: guild,
        guildId: guildId
      });
    } catch (error) {
      logger.error('Error loading custom embeds:', error);
      res.status(500).send('Error loading custom embeds page');
    }
  });

  // Role Commands route
  app.get('/servers/:guildId/role-commands', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      
      // Try to get guild info from bot API
      let guild = null;
      try {
        const guildResponse = await botAPI.getGuildInfo(guildId);
        if (guildResponse.success) {
          guild = guildResponse.data;
        }
      } catch (apiError) {
        logger.warn('Bot API not available for guild info, using fallback:', apiError);
        // Fallback: Create a basic guild object
        guild = {
          id: guildId,
          name: 'Server',
          roles: []
        };
      }

      res.render('servers/role-commands', { 
        user: req.user, 
        guild: guild,
        guildId: guildId
      });
    } catch (error) {
      logger.error('Error loading role commands:', error);
      res.status(500).send('Error loading role commands page');
    }
  });

  // Server-specific dashboard
  app.get('/servers/:guildId', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      
      // Get comprehensive server data
      const [guildSettings, welcomeMessages, roleCommands, giveaways, fissureNotifications, analytics] = await Promise.all([
        botAPI.getGuildSettings(guildId).catch(() => ({ success: false, data: {} })),
        botAPI.getWelcomeMessages(guildId).catch(() => ({ success: false, data: {} })),
        botAPI.getRoleCommands(guildId).catch(() => ({ success: false, data: [] })),
        botAPI.getGiveaways(guildId).catch(() => ({ success: false, data: [] })),
        botAPI.getFissureNotifications(guildId).catch(() => ({ success: false, data: [] })),
        botAPI.getAnalytics(guildId).catch(() => ({ success: false, data: {} }))
      ]);

      res.render('servers/dashboard', { 
        user: req.user,
        guildId,
        guildSettings: guildSettings.data || {},
        welcomeMessages: welcomeMessages.data || {},
        roleCommands: roleCommands.data || [],
        giveaways: giveaways.data || [],
        fissureNotifications: fissureNotifications.data || [],
        analytics: analytics.data || {}
      });
    } catch (error) {
      logger.error('Error loading server dashboard:', error);
      res.status(500).send('Error loading server dashboard');
    }
  });

  // Welcome Messages Management
  app.get('/servers/:guildId/welcome', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const welcomeData = await botAPI.getWelcomeMessages(guildId);
      
      res.render('servers/welcome', { 
        user: req.user,
        guildId,
        welcomeMessages: welcomeData.data || {}
      });
    } catch (error) {
      logger.error('Error loading welcome messages:', error);
      res.status(500).send('Error loading welcome messages');
    }
  });

  app.post('/servers/:guildId/welcome', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.updateWelcomeMessage(guildId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error updating welcome message:', error);
      res.status(500).json({ success: false, error: 'Failed to update welcome message' });
    }
  });

  // Role Commands Management
  app.get('/servers/:guildId/role-commands', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const [roleCommands, roles] = await Promise.all([
        botAPI.getRoleCommands(guildId),
        botAPI.getGuildRoles(guildId)
      ]);
      
      res.render('servers/role-commands', { 
        user: req.user,
        guildId,
        roleCommands: roleCommands.data || [],
        roles: roles.data || []
      });
    } catch (error) {
      logger.error('Error loading role commands:', error);
      res.status(500).send('Error loading role commands');
    }
  });

  app.post('/servers/:guildId/role-commands', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.createRoleCommand(guildId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error creating role command:', error);
      res.status(500).json({ success: false, error: 'Failed to create role command' });
    }
  });

  app.put('/servers/:guildId/role-commands/:commandId', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId, commandId } = req.params;
      const response = await botAPI.updateRoleCommand(guildId, commandId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error updating role command:', error);
      res.status(500).json({ success: false, error: 'Failed to update role command' });
    }
  });

  app.delete('/servers/:guildId/role-commands/:commandId', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId, commandId } = req.params;
      const response = await botAPI.deleteRoleCommand(guildId, commandId);
      res.json(response);
    } catch (error) {
      logger.error('Error deleting role command:', error);
      res.status(500).json({ success: false, error: 'Failed to delete role command' });
    }
  });

  // Giveaway Management
  app.get('/servers/:guildId/giveaways', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const giveaways = await botAPI.getGiveaways(guildId);
      
      res.render('servers/giveaways', { 
        user: req.user,
        guildId,
        giveaways: giveaways.data || []
      });
    } catch (error) {
      logger.error('Error loading giveaways:', error);
      res.status(500).send('Error loading giveaways');
    }
  });

  app.post('/servers/:guildId/giveaways', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.createGiveaway(guildId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error creating giveaway:', error);
      res.status(500).json({ success: false, error: 'Failed to create giveaway' });
    }
  });

  app.post('/servers/:guildId/giveaways/:giveawayId/end', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId, giveawayId } = req.params;
      const response = await botAPI.endGiveaway(guildId, giveawayId);
      res.json(response);
    } catch (error) {
      logger.error('Error ending giveaway:', error);
      res.status(500).json({ success: false, error: 'Failed to end giveaway' });
    }
  });

  // Fissure Notifications Management
  app.get('/servers/:guildId/fissure-notifications', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const [notifications, channels] = await Promise.all([
        botAPI.getFissureNotifications(guildId),
        botAPI.getChannels(guildId)
      ]);
      
      res.render('servers/fissure-notifications', { 
        user: req.user,
        guildId,
        notifications: notifications.data || [],
        channels: channels.data || []
      });
    } catch (error) {
      logger.error('Error loading fissure notifications:', error);
      res.status(500).send('Error loading fissure notifications');
    }
  });

  app.post('/servers/:guildId/fissure-notifications', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.createFissureNotification(guildId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error creating fissure notification:', error);
      res.status(500).json({ success: false, error: 'Failed to create fissure notification' });
    }
  });

  // Analytics Dashboard
  app.get('/servers/:guildId/analytics', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const analytics = await botAPI.getAnalytics(guildId);
      
      res.render('servers/analytics', { 
        user: req.user,
        guildId,
        analytics: analytics.data || {}
      });
    } catch (error) {
      logger.error('Error loading analytics:', error);
      res.status(500).send('Error loading analytics');
    }
  });

  // Logs Viewer
  app.get('/servers/:guildId/logs', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const { type, limit } = req.query;
      const logs = await botAPI.getLogs(guildId, type as string, limit ? parseInt(limit as string) : undefined);
      
      res.render('servers/logs', { 
        user: req.user,
        guildId,
        logs: logs.data || [],
        logType: type || 'all'
      });
    } catch (error) {
      logger.error('Error loading logs:', error);
      res.status(500).send('Error loading logs');
    }
  });

  // Moderation Tools
  app.get('/servers/:guildId/moderation', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const [moderationActions, members] = await Promise.all([
        botAPI.getModerationActions(guildId),
        botAPI.getGuildMembers(guildId)
      ]);
      
      res.render('servers/moderation', { 
        user: req.user,
        guildId,
        moderationActions: moderationActions.data || [],
        members: members.data || []
      });
    } catch (error) {
      logger.error('Error loading moderation tools:', error);
      res.status(500).send('Error loading moderation tools');
    }
  });

  app.post('/servers/:guildId/moderation', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.performModerationAction(guildId, req.body);
      res.json(response);
    } catch (error) {
      logger.error('Error performing moderation action:', error);
      res.status(500).json({ success: false, error: 'Failed to perform moderation action' });
    }
  });

  // API routes for AJAX calls
  app.get('/api/servers/:guildId/channels', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.getChannels(guildId);
      res.json(response);
    } catch (error) {
      logger.error('Error getting channels:', error);
      res.status(500).json({ success: false, error: 'Failed to get channels' });
    }
  });

  app.get('/api/servers/:guildId/roles', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.getGuildRoles(guildId);
      res.json(response);
    } catch (error) {
      logger.error('Error getting roles:', error);
      res.status(500).json({ success: false, error: 'Failed to get roles' });
    }
  });

  app.get('/api/servers/:guildId/members', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { guildId } = req.params;
      const response = await botAPI.getGuildMembers(guildId);
      res.json(response);
    } catch (error) {
      logger.error('Error getting members:', error);
      res.status(500).json({ success: false, error: 'Failed to get members' });
    }
  });

  // Custom Embeds API Routes
  app.post('/api/embeds/send', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { channelId, embed } = req.body;
      
      if (!channelId || !embed) {
        return res.status(400).json({ success: false, error: 'Missing channelId or embed data' });
      }

      // Try to send via bot API if available
      try {
        const response = await botAPI.sendEmbed(channelId, embed);
        if (response.success) {
          return res.json({ success: true, messageId: response.messageId });
        }
      } catch (apiError) {
        logger.warn('Bot API not available for embed sending, using fallback:', apiError);
      }

      // Fallback: Store in database for bot to process later
      const result = await dbPool.query(
        `INSERT INTO custom_embeds (guild_id, creator_id, name, title, description, color, thumbnail, image, footer, timestamp, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING id`,
        [
          'temp_guild', // We'll need to get the actual guild ID
          req.user.id,
          `Custom Embed ${Date.now()}`,
          embed.title || '',
          embed.description || '',
          embed.color || '#5865f2',
          embed.thumbnail || '',
          embed.image || '',
          embed.footer || '',
          embed.timestamp || false
        ]
      );

      res.json({ 
        success: true, 
        message: 'Embed queued for sending (bot offline)',
        embedId: result.rows[0].id
      });

    } catch (error) {
      logger.error('Error sending embed:', error);
      res.status(500).json({ success: false, error: 'Failed to send embed' });
    }
  });

  // Template Management
  app.get('/api/embeds/templates', ensureLoggedIn, async (req: any, res) => {
    try {
      const result = await dbPool.query(
        `SELECT id, name, embed_data, created_at 
         FROM embed_templates 
         WHERE created_by = $1 
         ORDER BY created_at DESC`,
        [req.user.id]
      );

      res.json({ 
        success: true, 
        templates: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          embed: JSON.parse(row.embed_data),
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      logger.error('Error getting templates:', error);
      res.status(500).json({ success: false, error: 'Failed to get templates' });
    }
  });

  app.get('/api/embeds/templates/:templateId', ensureLoggedIn, async (req: any, res) => {
    try {
      const { templateId } = req.params;
      const result = await dbPool.query(
        `SELECT embed_data FROM embed_templates 
         WHERE id = $1 AND created_by = $2`,
        [templateId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }

      res.json({ 
        success: true, 
        embed: JSON.parse(result.rows[0].embed_data)
      });
    } catch (error) {
      logger.error('Error getting template:', error);
      res.status(500).json({ success: false, error: 'Failed to get template' });
    }
  });

  app.post('/api/embeds/templates', ensureLoggedIn, async (req: any, res) => {
    try {
      const { name, embed } = req.body;
      
      if (!name || !embed) {
        return res.status(400).json({ success: false, error: 'Missing name or embed data' });
      }

      const result = await dbPool.query(
        `INSERT INTO embed_templates (name, embed_data, created_by, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [name, JSON.stringify(embed), req.user.id]
      );

      res.json({ 
        success: true, 
        templateId: result.rows[0].id,
        message: 'Template saved successfully'
      });
    } catch (error) {
      logger.error('Error saving template:', error);
      res.status(500).json({ success: false, error: 'Failed to save template' });
    }
  });

  app.delete('/api/embeds/templates/:templateId', ensureLoggedIn, async (req: any, res) => {
    try {
      const { templateId } = req.params;
      const result = await dbPool.query(
        `DELETE FROM embed_templates 
         WHERE id = $1 AND created_by = $2
         RETURNING id`,
        [templateId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }

      res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      logger.error('Error deleting template:', error);
      res.status(500).json({ success: false, error: 'Failed to delete template' });
    }
  });

  // Custom Commands API Routes
  app.get('/api/commands', ensureLoggedIn, async (req: any, res) => {
    try {
      const result = await dbPool.query(
        `SELECT id, name, type, description, enabled, command_data, created_at 
         FROM custom_commands 
         WHERE created_by = $1 
         ORDER BY created_at DESC`,
        [req.user.id]
      );

      res.json({ 
        success: true, 
        commands: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          type: row.type,
          description: row.description,
          enabled: row.enabled,
          data: JSON.parse(row.command_data || '{}'),
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      logger.error('Error getting commands:', error);
      res.status(500).json({ success: false, error: 'Failed to get commands' });
    }
  });

  app.post('/api/commands', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { name, type, description, enabled, ...commandData } = req.body;
      
      if (!name || !type) {
        return res.status(400).json({ success: false, error: 'Missing name or type' });
      }

      const result = await dbPool.query(
        `INSERT INTO custom_commands (name, type, description, enabled, command_data, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [name, type, description || '', enabled !== false, JSON.stringify(commandData), req.user.id]
      );

      res.json({ 
        success: true, 
        commandId: result.rows[0].id,
        message: 'Command created successfully'
      });
    } catch (error) {
      logger.error('Error creating command:', error);
      res.status(500).json({ success: false, error: 'Failed to create command' });
    }
  });

  app.delete('/api/commands/:commandId', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { commandId } = req.params;
      const result = await dbPool.query(
        `DELETE FROM custom_commands 
         WHERE id = $1 AND created_by = $2
         RETURNING id`,
        [commandId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Command not found' });
      }

      res.json({ success: true, message: 'Command deleted successfully' });
    } catch (error) {
      logger.error('Error deleting command:', error);
      res.status(500).json({ success: false, error: 'Failed to delete command' });
    }
  });

  const port = config.DASHBOARD_PORT || 3080;
  app.listen(port, () => logger.info(`Enhanced Dashboard listening on :${port}`));
}

// Allow standalone execution
if (require.main === module) {
  startEnhancedDashboard();
}
