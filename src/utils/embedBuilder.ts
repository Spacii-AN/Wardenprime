import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { pgdb } from '../services/postgresDatabase';
import { logger } from './logger';

/**
 * Standard colors used across the bot (fallback values)
 */
export const Colors = {
  PRIMARY: 0x5865F2, // Discord Blurple
  SUCCESS: 0x57F287, // Green
  ERROR: 0xED4245,   // Red
  WARNING: 0xFEE75C, // Yellow
  INFO: 0x5865F2     // Discord Blurple
};

/**
 * Get embed colors for a guild from database with fallbacks
 */
async function getGuildEmbedColors(guildId?: string): Promise<typeof Colors> {
  if (!guildId || !pgdb) {
    return Colors;
  }

  try {
    const colors = await pgdb.getEmbedColors(guildId);
    return {
      PRIMARY: parseInt(colors.primary.replace('#', ''), 16),
      SUCCESS: parseInt(colors.success.replace('#', ''), 16),
      ERROR: parseInt(colors.error.replace('#', ''), 16),
      WARNING: parseInt(colors.warning.replace('#', ''), 16),
      INFO: parseInt(colors.info.replace('#', ''), 16)
    };
  } catch (error) {
    logger.error('Error getting guild embed colors:', error);
    return Colors;
  }
}

/**
 * Get embed settings for a guild from database with fallbacks
 */
async function getGuildEmbedSettings(guildId?: string): Promise<{
  footer?: string;
  authorName?: string;
  authorIcon?: string;
  authorUrl?: string;
  showTimestamp?: boolean;
  showAuthor?: boolean;
}> {
  if (!guildId || !pgdb) {
    return {};
  }

  try {
    const settings = await pgdb.getAllEmbedSettings(guildId);
    return {
      footer: settings.default_footer,
      authorName: settings.default_author_name,
      authorIcon: settings.default_author_icon,
      authorUrl: settings.default_author_url,
      showTimestamp: settings.show_timestamp === 'true',
      showAuthor: settings.show_author === 'true'
    };
  } catch (error) {
    logger.error('Error getting guild embed settings:', error);
    return {};
  }
}

/**
 * Default image URL for embed author icon
 */
export const DEFAULT_AUTHOR_ICON = 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048';

/**
 * Types of embed messages
 */
export type EmbedType = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'danger';

/**
 * Create a standard embed with consistent styling
 * Now supports guild-specific customization via database settings
 */
export async function createEmbed(options: {
  type?: EmbedType;
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  thumbnail?: string;
  image?: string;
  author?: { name: string; iconURL?: string; url?: string };
  timestamp?: boolean;
  color?: ColorResolvable;
  guildId?: string; // Add guildId for database customization
}) {
  // Default to primary type if not specified
  const type = options.type || 'primary';
  
  // Get guild-specific colors if guildId is provided
  let colors = Colors;
  if (options.guildId) {
    try {
      colors = await getGuildEmbedColors(options.guildId);
    } catch (error) {
      logger.error('Error getting guild colors, using defaults:', error);
    }
  }
  
  // Map the type to color
  let color = options.color || colors.PRIMARY;
  switch (type) {
    case 'success':
      color = colors.SUCCESS;
      break;
    case 'error':
    case 'danger': // Danger uses the same color as error
      color = colors.ERROR;
      break;
    case 'warning':
      color = colors.WARNING;
      break;
    case 'info':
      color = colors.INFO;
      break;
  }
  
  // Get guild-specific settings if guildId is provided
  let guildSettings: any = {};
  if (options.guildId) {
    try {
      guildSettings = await getGuildEmbedSettings(options.guildId);
    } catch (error) {
      logger.error('Error getting guild settings, using defaults:', error);
    }
  }
  
  // Create the embed
  const embed = new EmbedBuilder()
    .setColor(color as ColorResolvable);
  
  // Add optional properties
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  
  // Footer: use provided footer, then guild setting, then nothing
  const footerText = options.footer || guildSettings.footer;
  if (footerText) embed.setFooter({ text: footerText });
  
  // Timestamp: use provided timestamp, then guild setting, then false
  const showTimestamp = options.timestamp !== undefined ? options.timestamp : guildSettings.showTimestamp;
  if (showTimestamp) embed.setTimestamp();
  
  // Author: use provided author, then guild settings, then default
  const authorName = options.author?.name || guildSettings.authorName || ' ';
  const authorIcon = options.author?.iconURL || guildSettings.authorIcon || DEFAULT_AUTHOR_ICON;
  const authorUrl = options.author?.url || guildSettings.authorUrl;
  
  // Only set author if showAuthor is true (default true) or explicitly provided
  const showAuthor = options.author !== undefined || guildSettings.showAuthor !== false;
  if (showAuthor) {
    embed.setAuthor({
      name: authorName,
      iconURL: authorIcon,
      url: authorUrl
    });
  }
  
  // Add fields if provided
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }
  
  return embed;
}

/**
 * Synchronous version of createEmbed for backward compatibility
 * Uses default colors and settings
 */
export function createEmbedSync(options: {
  type?: EmbedType;
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  thumbnail?: string;
  image?: string;
  author?: { name: string; iconURL?: string; url?: string };
  timestamp?: boolean;
  color?: ColorResolvable;
}) {
  // Default to primary type if not specified
  const type = options.type || 'primary';
  
  // Map the type to color
  let color = options.color || Colors.PRIMARY;
  switch (type) {
    case 'success':
      color = Colors.SUCCESS;
      break;
    case 'error':
    case 'danger': // Danger uses the same color as error
      color = Colors.ERROR;
      break;
    case 'warning':
      color = Colors.WARNING;
      break;
    case 'info':
      color = Colors.INFO;
      break;
  }
  
  // Create the embed
  const embed = new EmbedBuilder()
    .setColor(color as ColorResolvable);
  
  // Add optional properties
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.timestamp) embed.setTimestamp();
  
  // ALWAYS set the author field to ensure the icon appears
  // If author provided, use it with DEFAULT_AUTHOR_ICON as fallback
  // If no author provided, use a space character to make the icon visible
  embed.setAuthor({
    name: options.author?.name || ' ',
    iconURL: options.author?.iconURL || DEFAULT_AUTHOR_ICON,
    url: options.author?.url
  });
  
  // Add fields if provided
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }
  
  return embed;
} 