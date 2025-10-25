"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDashboard = startDashboard;
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const passport_discord_1 = require("passport-discord");
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../../src/config/config");
const logger_1 = require("../../src/utils/logger");
const permissionService_1 = require("../../src/services/permissionService");
// Bot API client
class BotAPIClient {
    constructor(baseURL, apiKey) {
        this.baseURL = baseURL;
        this.apiKey = apiKey;
    }
    async request(endpoint, options = {}) {
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
    async getBotStatus() {
        return this.request('/api/bot/status');
    }
    async toggleService(service, enabled) {
        return this.request('/api/bot/services/toggle', {
            method: 'POST',
            body: JSON.stringify({ service, enabled }),
        });
    }
    async updateDictionaries() {
        return this.request('/api/bot/dictionary/update', { method: 'POST' });
    }
    async getGuilds() {
        return this.request('/api/bot/guilds');
    }
    async getChannels(guildId) {
        return this.request(`/api/bot/guild/${guildId}/channels`);
    }
    async getNotifications() {
        return this.request('/api/bot/notifications');
    }
    async updateNotifications(service, enabled, channelId) {
        return this.request('/api/bot/notifications', {
            method: 'POST',
            body: JSON.stringify({ service, enabled, channelId }),
        });
    }
    async getWarframes() {
        return this.request('/api/bot/warframes');
    }
    async createWarframe(data) {
        return this.request('/api/bot/warframes', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
    // Embed Settings methods
    async getEmbedSettings(guildId) {
        return this.request(`/api/bot/embeds/settings/${guildId}`);
    }
    async updateEmbedSettings(guildId, settings) {
        return this.request(`/api/bot/embeds/settings/${guildId}`, {
            method: 'POST',
            body: JSON.stringify(settings),
        });
    }
    async resetEmbedSettings(guildId) {
        return this.request(`/api/bot/embeds/settings/${guildId}/reset`, {
            method: 'POST',
        });
    }
    async testEmbed(guildId) {
        return this.request(`/api/bot/embeds/test/${guildId}`, {
            method: 'POST',
        });
    }
}
// Initialize bot API client
const botAPI = new BotAPIClient('http://localhost:3081', config_1.config.DASHBOARD_SESSION_SECRET);
function startDashboard() {
    if (!config_1.config.DASHBOARD_ENABLED) {
        logger_1.logger.info('Dashboard disabled (DASHBOARD_ENABLED=false)');
        return;
    }
    if (!config_1.config.DASHBOARD_SESSION_SECRET) {
        logger_1.logger.warn('DASHBOARD_SESSION_SECRET not set; refusing to start dashboard');
        return;
    }
    const app = (0, express_1.default)();
    app.set('view engine', 'ejs');
    app.set('views', path_1.default.join(__dirname, '../views'));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use(express_1.default.json());
    // Serve static files
    app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
    app.use((0, express_session_1.default)({
        secret: config_1.config.DASHBOARD_SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    }));
    const oauthEnabled = !process.env.OAUTH_DISABLED && !!config_1.config.CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET;
    if (oauthEnabled) {
        const scopes = ['identify', 'guilds'];
        passport_1.default.use(new passport_discord_1.Strategy({
            clientID: config_1.config.CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            callbackURL: config_1.config.OAUTH_CALLBACK_URL || `${config_1.config.DASHBOARD_PUBLIC_URL}/auth/callback`,
            scope: scopes,
        }, (accessToken, refreshToken, profile, done) => {
            return done(null, { id: profile.id, username: profile.username, discriminator: profile.discriminator, guilds: profile.guilds });
        }));
        passport_1.default.serializeUser((user, done) => done(null, user));
        passport_1.default.deserializeUser((obj, done) => done(null, obj));
        app.use(passport_1.default.initialize());
        app.use(passport_1.default.session());
    }
    else {
        // Preview mode: stub a user so views show as logged-in
        app.use((req, _res, next) => {
            req.user = { username: 'Preview', discriminator: '0000' };
            next();
        });
    }
    function ensureLoggedIn(req, res, next) {
        if (!oauthEnabled)
            return next();
        if (req.isAuthenticated && req.isAuthenticated())
            return next();
        return res.redirect('/login');
    }
    async function ensureModOrAdmin(req, res, next) {
        try {
            // If database is not Postgres, skip DB-backed authz for preview
            if (config_1.config.DATABASE_TYPE !== 'postgres')
                return next();
            const user = req.user;
            const guildId = req.query.guildId || req.params.guildId;
            if (!guildId) {
                return res.status(400).send('Missing guildId');
            }
            const perms = await (0, permissionService_1.getGuildPermissionRoles)(String(guildId));
            // Basic allow: if user is in admin/mod roles by ID (requires client-side check in real app)
            // For now, allow all logged-in users; tighten later with member-role check via bot
            return next();
        }
        catch (e) {
            logger_1.logger.error('AuthZ error', e);
            return res.sendStatus(403);
        }
    }
    if (oauthEnabled) {
        app.get('/login', passport_1.default.authenticate('discord'));
        app.get('/auth/callback', passport_1.default.authenticate('discord', { failureRedirect: '/login' }), (req, res) => {
            res.redirect('/');
        });
        app.get('/logout', (req, res) => {
            req.logout(() => res.redirect('/'));
        });
    }
    else {
        app.get('/login', (_req, res) => res.redirect('/'));
        app.get('/logout', (_req, res) => res.redirect('/'));
    }
    app.get('/', async (req, res) => {
        try {
            const ws = await axios_1.default.get('https://oracle.browse.wf/worldState.json', { timeout: 10000, headers: { 'User-Agent': 'WardenPrimeBot/1.0.0' } });
            res.render('home', { user: req.user, worldState: ws.data });
        }
        catch (e) {
            logger_1.logger.error('World state fetch failed', e);
            res.render('home', { user: req.user, worldState: null });
        }
    });
    // Bot Control Dashboard
    app.get('/dashboard', ensureLoggedIn, async (req, res) => {
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
        }
        catch (error) {
            logger_1.logger.error('Error loading bot control dashboard:', error);
            res.status(500).send('Error loading dashboard');
        }
    });
    // Service Management Routes - Proxy to Bot API
    app.post('/api/services/toggle', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const { service, enabled } = req.body;
            const response = await botAPI.toggleService(service, enabled);
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Error toggling service:', error);
            res.status(500).json({ success: false, error: 'Failed to toggle service' });
        }
    });
    app.post('/api/dictionary/update', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const response = await botAPI.updateDictionaries();
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Error updating dictionaries:', error);
            res.status(500).json({ success: false, error: 'Failed to update dictionaries' });
        }
    });
    app.get('/warframes', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const response = await botAPI.getWarframes();
            if (response.success) {
                res.render('warframes/list', { user: req.user, items: response.data });
            }
            else {
                res.render('warframes/list', { user: req.user, items: [] });
            }
        }
        catch (error) {
            logger_1.logger.error('Error getting warframes:', error);
            res.render('warframes/list', { user: req.user, items: [] });
        }
    });
    app.get('/warframes/new', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        res.render('warframes/edit', { user: req.user, item: null });
    });
    app.post('/warframes', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const { name, craftingCostCredits, resourceMap, notes } = req.body;
            const createdBy = req.user.username;
            const response = await botAPI.createWarframe({
                name,
                craftingCostCredits: parseInt(craftingCostCredits),
                resourceMap: JSON.parse(resourceMap || '{}'),
                notes,
                createdBy
            });
            if (response.success) {
                res.redirect('/warframes');
            }
            else {
                res.status(400).send('Failed to create warframe');
            }
        }
        catch (error) {
            logger_1.logger.error('Error creating warframe:', error);
            res.status(500).send('Error creating warframe');
        }
    });
    // Join Form routes
    app.get('/joinform', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            res.render('joinform/index', { user: req.user });
        }
        catch (error) {
            logger_1.logger.error('Error loading join form page:', error);
            res.render('error', { user: req.user, error: 'Failed to load join form page' });
        }
    });
    // Embed Settings Routes
    app.get('/embeds', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            res.render('embeds/settings', { user: req.user });
        }
        catch (error) {
            logger_1.logger.error('Error loading embed settings page:', error);
            res.render('error', { user: req.user, error: 'Failed to load embed settings page' });
        }
    });
    // Get embed settings API
    app.get('/api/embeds/settings', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            // For now, we'll use a default guild ID or get it from the user's guilds
            // In a real implementation, you'd want to get the current guild context
            const guildId = req.query.guildId || 'global';
            const response = await botAPI.getEmbedSettings(guildId);
            res.json(response.data || {});
        }
        catch (error) {
            logger_1.logger.error('Error getting embed settings:', error);
            res.status(500).json({ success: false, error: 'Failed to get embed settings' });
        }
    });
    // Update embed settings API
    app.post('/api/embeds/settings', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const guildId = req.body.guildId || 'global';
            const settings = req.body;
            const response = await botAPI.updateEmbedSettings(guildId, settings);
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Error updating embed settings:', error);
            res.status(500).json({ success: false, error: 'Failed to update embed settings' });
        }
    });
    // Reset embed settings API
    app.post('/api/embeds/settings/reset', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const guildId = req.body.guildId || 'global';
            const response = await botAPI.resetEmbedSettings(guildId);
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Error resetting embed settings:', error);
            res.status(500).json({ success: false, error: 'Failed to reset embed settings' });
        }
    });
    // Test embed API
    app.post('/api/embeds/test', ensureLoggedIn, ensureModOrAdmin, async (req, res) => {
        try {
            const guildId = req.body.guildId || 'global';
            const response = await botAPI.testEmbed(guildId);
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Error testing embed:', error);
            res.status(500).json({ success: false, error: 'Failed to test embed' });
        }
    });
    const port = config_1.config.DASHBOARD_PORT || 3080;
    app.listen(port, () => logger_1.logger.info(`Dashboard listening on :${port}`));
}
// Allow standalone execution via `ts-node src/dashboard/server.ts`
if (require.main === module) {
    startDashboard();
}
