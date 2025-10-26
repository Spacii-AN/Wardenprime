/**
 * Time-related constants for the WardenPrime bot
 */

// Time constants in milliseconds
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

// Service check intervals
export const SERVICE_INTERVALS = {
  FISSURE_CHECK: 45 * 1000, // 45 seconds (fissures change frequently)
  LFG_CLEANUP: 15 * 60 * 1000, // 15 minutes
  DICTIONARY_UPDATE: 60 * 60 * 1000, // 1 hour
} as const;

// API timeouts
export const API_TIMEOUTS = {
  DISCORD_API: 60 * 1000, // 60 seconds
  WARFRAME_API: 30 * 1000, // 30 seconds
  DATABASE_QUERY: 10 * 1000, // 10 seconds
} as const;

// Giveaway limits
export const GIVEAWAY_LIMITS = {
  MAX_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  MIN_DURATION: 5 * 60 * 1000, // 5 minutes
  MAX_WINNERS: 100,
  MIN_WINNERS: 1,
} as const;

// Cooldown periods
export const COOLDOWNS = {
  COMMAND_DEFAULT: 3 * 1000, // 3 seconds
  COMMAND_ADMIN: 1 * 1000, // 1 second
  API_RATE_LIMIT: 1 * 1000, // 1 second
} as const;
