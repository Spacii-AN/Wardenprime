import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import axios from 'axios';

// Simple logger for dashboard
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

// Configuration from environment variables
const config = {
  DASHBOARD_ENABLED: process.env.DASHBOARD_ENABLED !== 'false',
  DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || '3080'),
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET || process.env.SESSION_SECRET,
  DASHBOARD_PUBLIC_URL: process.env.DASHBOARD_PUBLIC_URL,
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL,
  CLIENT_ID: process.env.CLIENT_ID,
  BOT_API_URL: process.env.BOT_API_URL || 'http://localhost:3081',
  BOT_API_KEY: process.env.BOT_API_KEY || 'dev-api-key'
};

// Bot API client
class BotAPIClient {
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

  async getWarframes(): Promise<any> {
    return this.request('/api/bot/warframes');
  }

  async createWarframe(data: any): Promise<any> {
    return this.request('/api/bot/warframes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Embed Settings methods
  async getEmbedSettings(guildId: string): Promise<any> {
    return this.request(`/api/bot/embeds/settings/${guildId}`);
  }

  async updateEmbedSettings(guildId: string, settings: any): Promise<any> {
    return this.request(`/api/bot/embeds/settings/${guildId}`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async resetEmbedSettings(guildId: string): Promise<any> {
    return this.request(`/api/bot/embeds/settings/${guildId}/reset`, {
      method: 'POST',
    });
  }

  async testEmbed(guildId: string): Promise<any> {
    return this.request(`/api/bot/embeds/test/${guildId}`, {
      method: 'POST',
    });
  }
}

// Initialize bot API client
const botAPI = new BotAPIClient(config.BOT_API_URL, config.BOT_API_KEY);

type DiscordProfile = any;

export function startDashboard() {
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
      return done(null, { id: profile.id, username: profile.username, discriminator: profile.discriminator, guilds: profile.guilds });
    }));

    passport.serializeUser((user: any, done) => done(null, user));
    passport.deserializeUser((obj: any, done) => done(null, obj));

    app.use(passport.initialize());
    app.use(passport.session());
  } else {
    // Preview mode: stub a user so views show as logged-in
    app.use((req: any, _res, next) => {
      req.user = { username: 'Preview', discriminator: '0000' };
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
      // For now, allow all logged-in users; tighten later with member-role check via bot
      return next();
    } catch (e) {
      logger.error('AuthZ error', e);
      return res.sendStatus(403);
    }
  }

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

  app.get('/', async (req: any, res) => {
    try {
      const ws = await axios.get('https://oracle.browse.wf/worldState.json', { timeout: 10000, headers: { 'User-Agent': 'WardenPrimeBot/1.0.0' } });
      res.render('home', { user: req.user, worldState: ws.data });
    } catch (e) {
      logger.error('World state fetch failed', e);
      res.render('home', { user: req.user, worldState: null });
    }
  });

  // Bot Control Dashboard
  app.get('/dashboard', ensureLoggedIn, async (req: any, res) => {
    try {
      // Get real bot status from API
      const botStatusResponse = await botAPI.getBotStatus();
      const notificationsResponse = await botAPI.getNotifications();
      
      if (!botStatusResponse.success || !notificationsResponse.success) {
        throw new Error('Failed to fetch bot data');
      }

      res.render('dashboard/bot-control', { 
        user: req.user, 
        botStatus: botStatusResponse.data, 
        notifications: notificationsResponse.data 
      });
    } catch (error) {
      logger.error('Error loading bot control dashboard:', error);
      res.status(500).send('Error loading dashboard');
    }
  });

  // Service Management Routes - Proxy to Bot API
  app.post('/api/services/toggle', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const { service, enabled } = req.body;
      const response = await botAPI.toggleService(service, enabled);
      res.json(response);
    } catch (error) {
      logger.error('Error toggling service:', error);
      res.status(500).json({ success: false, error: 'Failed to toggle service' });
    }
  });

  app.post('/api/dictionary/update', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const response = await botAPI.updateDictionaries();
      res.json(response);
    } catch (error) {
      logger.error('Error updating dictionaries:', error);
      res.status(500).json({ success: false, error: 'Failed to update dictionaries' });
    }
  });

  app.get('/warframes', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
    try {
      const response = await botAPI.getWarframes();
      if (response.success) {
        res.render('warframes/list', { user: (req as any).user, items: response.data });
      } else {
        res.render('warframes/list', { user: (req as any).user, items: [] });
      }
    } catch (error) {
      logger.error('Error getting warframes:', error);
      res.render('warframes/list', { user: (req as any).user, items: [] });
    }
  });
  
  app.get('/warframes/new', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
    res.render('warframes/edit', { user: (req as any).user, item: null });
  });

  app.post('/warframes', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
    try {
      const { name, craftingCostCredits, resourceMap, notes } = req.body;
      const createdBy = (req as any).user.username;
      
      const response = await botAPI.createWarframe({
        name,
        craftingCostCredits: parseInt(craftingCostCredits),
        resourceMap: JSON.parse(resourceMap || '{}'),
        notes,
        createdBy
      });
      
      if (response.success) {
        res.redirect('/warframes');
      } else {
        res.status(400).send('Failed to create warframe');
      }
    } catch (error) {
      logger.error('Error creating warframe:', error);
      res.status(500).send('Error creating warframe');
    }
  });

  // Join Form routes
  app.get('/joinform', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      res.render('joinform/index', { user: req.user });
    } catch (error) {
      logger.error('Error loading join form page:', error);
      res.render('error', { user: req.user, error: 'Failed to load join form page' });
    }
  });

  // Embed Settings Routes
  app.get('/embeds', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      res.render('embeds/settings', { user: req.user });
    } catch (error) {
      logger.error('Error loading embed settings page:', error);
      res.render('error', { user: req.user, error: 'Failed to load embed settings page' });
    }
  });

  // Get embed settings API
  app.get('/api/embeds/settings', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      // For now, we'll use a default guild ID or get it from the user's guilds
      // In a real implementation, you'd want to get the current guild context
      const guildId = req.query.guildId || 'global';
      
      const response = await botAPI.getEmbedSettings(guildId);
      res.json(response.data || {});
    } catch (error) {
      logger.error('Error getting embed settings:', error);
      res.status(500).json({ success: false, error: 'Failed to get embed settings' });
    }
  });

  // Update embed settings API
  app.post('/api/embeds/settings', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const guildId = req.body.guildId || 'global';
      const settings = req.body;
      
      const response = await botAPI.updateEmbedSettings(guildId, settings);
      res.json(response);
    } catch (error) {
      logger.error('Error updating embed settings:', error);
      res.status(500).json({ success: false, error: 'Failed to update embed settings' });
    }
  });

  // Reset embed settings API
  app.post('/api/embeds/settings/reset', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const guildId = req.body.guildId || 'global';
      
      const response = await botAPI.resetEmbedSettings(guildId);
      res.json(response);
    } catch (error) {
      logger.error('Error resetting embed settings:', error);
      res.status(500).json({ success: false, error: 'Failed to reset embed settings' });
    }
  });

  // Test embed API
  app.post('/api/embeds/test', ensureLoggedIn, ensureModOrAdmin, async (req: any, res) => {
    try {
      const guildId = req.body.guildId || 'global';
      
      const response = await botAPI.testEmbed(guildId);
      res.json(response);
    } catch (error) {
      logger.error('Error testing embed:', error);
      res.status(500).json({ success: false, error: 'Failed to test embed' });
    }
  });

  const port = config.DASHBOARD_PORT || 3080;
  app.listen(port, () => logger.info(`Dashboard listening on :${port}`));
}

// Allow standalone execution via `ts-node src/dashboard/server.ts`
if (require.main === module) {
  startDashboard();
}