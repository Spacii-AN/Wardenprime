import dotenv from 'dotenv';
import { GatewayIntentBits, Partials } from 'discord.js';

// Load environment variables
dotenv.config();

// Environment variables with type safety
interface Config {
  BOT_TOKEN: string;
  CLIENT_ID: string;
  TEST_GUILD_ID?: string;
  NODE_ENV: 'development' | 'production';
  isDev: boolean;
  
  // Bot customization
  BOT_NAME: string;
  BOT_PREFIX: string;
  BOT_OWNER_ID?: string;
  
  // Embed customization
  EMBED_COLOR: number;
  EMBED_FOOTER: string;
  
  // Feature flags
  ENABLE_COOLDOWNS: boolean;
  ENABLE_MENTIONS: boolean;
  ENABLE_LOGGING: boolean;
  LOG_LEVEL: string;
  SKIP_COMMAND_REGISTRATION: boolean;
  
  // Command deployment configuration
  COMMAND_DEPLOYMENT_MODE: 'guild' | 'global' | 'auto';
  DEPLOYMENT_GUILD_IDS: string[];
  
  // Database configuration
  DATABASE_TYPE: 'json' | 'postgres' | 'mongo' | 'other';
  
  // PostgreSQL specific configuration
  PG_HOST: string;
  PG_PORT: number;
  PG_DATABASE: string;
  PG_USER: string;
  PG_PASSWORD: string;
  PG_SSL_MODE: string;

  // Dashboard configuration
  DASHBOARD_ENABLED?: boolean;
  DASHBOARD_PORT?: number;
  DASHBOARD_PUBLIC_URL?: string;
  DASHBOARD_SESSION_SECRET?: string;
  OAUTH_CALLBACK_URL?: string;
}

// Validate required environment variables for bot runtime, but allow dashboard-only runs
const isDashboardProcess = (process.env.DASHBOARD_ENABLED === 'true') ||
  (process.argv && process.argv[1] && process.argv[1].includes('dashboard'));

if (!isDashboardProcess) {
  const requiredEnvVars = ['BOT_TOKEN', 'CLIENT_ID'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

// Get environment variable with default value
function getEnvVar<T>(key: string, defaultValue: T): T {
  const value = process.env[key];
  return value !== undefined ? (value as unknown as T) : defaultValue;
}

// Get boolean env var with common truthy strings
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const v = value.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

// Create config object
export const config: Config = {
  BOT_TOKEN: process.env.BOT_TOKEN!,
  CLIENT_ID: process.env.CLIENT_ID!,
  TEST_GUILD_ID: process.env.TEST_GUILD_ID,
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  
  // Bot customization - with defaults
  BOT_NAME: getEnvVar('BOT_NAME', 'Discord Bot'),
  BOT_PREFIX: getEnvVar('BOT_PREFIX', '!'),
  BOT_OWNER_ID: process.env.BOT_OWNER_ID,
  
  // Embed customization - with defaults
  EMBED_COLOR: parseInt(getEnvVar('EMBED_COLOR', '5865F2'), 16), // Discord Blurple
  EMBED_FOOTER: getEnvVar('EMBED_FOOTER', 'Powered by Discord.js'),
  
  // Feature flags - with defaults
  ENABLE_COOLDOWNS: getEnvVar('ENABLE_COOLDOWNS', 'true') === 'true',
  ENABLE_MENTIONS: getEnvVar('ENABLE_MENTIONS', 'true') === 'true',
  ENABLE_LOGGING: getEnvVar('ENABLE_LOGGING', 'true') === 'true',
  LOG_LEVEL: getEnvVar('LOG_LEVEL', process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG'),
  SKIP_COMMAND_REGISTRATION: process.env.SKIP_COMMAND_REGISTRATION === 'true',
  
  // Command deployment configuration
  COMMAND_DEPLOYMENT_MODE: getEnvVar('COMMAND_DEPLOYMENT_MODE', 'auto').toLowerCase() as 'guild' | 'global' | 'auto',
  DEPLOYMENT_GUILD_IDS: process.env.DEPLOYMENT_GUILD_IDS?.split(',') || [],
  
  // Database configuration - with defaults
  DATABASE_TYPE: getEnvVar('DATABASE_TYPE', 'postgres') as 'json' | 'postgres' | 'mongo' | 'other',
  
  // PostgreSQL specific configuration
  PG_HOST: getEnvVar('PG_HOST', 'discordpersonal-do-user-18514065-0.k.db.ondigitalocean.com'),
  PG_PORT: parseInt(getEnvVar('PG_PORT', '25060')),
  PG_DATABASE: getEnvVar('PG_DATABASE', 'defaultdb'),
  PG_USER: getEnvVar('PG_USER', 'doadmin'),
  PG_PASSWORD: getEnvVar('PG_PASSWORD', 'password'),
  PG_SSL_MODE: getEnvVar('PG_SSL_MODE', 'require'),

  // Dashboard
  DASHBOARD_ENABLED: getEnvBool('DASHBOARD_ENABLED', false),
  DASHBOARD_PORT: parseInt(getEnvVar('DASHBOARD_PORT', '3080')),
  DASHBOARD_PUBLIC_URL: getEnvVar('DASHBOARD_PUBLIC_URL', ''),
  DASHBOARD_SESSION_SECRET: getEnvVar('DASHBOARD_SESSION_SECRET', ''),
  OAUTH_CALLBACK_URL: getEnvVar('OAUTH_CALLBACK_URL', '')
};

// Define intents required for the bot
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildIntegrations,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.DirectMessageReactions,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates
];

// Discord.js client options
export const clientOptions = {
  intents: intents,
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.ThreadMember,
    Partials.GuildMember
  ],
  failIfNotExists: false,
  rest: {
    timeout: 60000, // 60 seconds timeout for API requests
    retries: 3      // Retry API requests 3 times
  }
}; 