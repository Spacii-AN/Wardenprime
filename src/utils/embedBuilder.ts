import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { pgdb } from '../services/postgresDatabase';
import { logger } from './logger';

/**
 * Standard colors used across the bot
 */
export const Colors = {
  PRIMARY: 0x5865F2, // Discord Blurple
  SUCCESS: 0x57F287, // Green
  ERROR: 0xED4245,   // Red
  WARNING: 0xFEE75C, // Yellow
  INFO: 0x5865F2     // Discord Blurple
};

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
 * This is the synchronous version for backward compatibility
 */
export function createEmbed(options: {
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
  guildId?: string; // For future database customization
}): EmbedBuilder {
  // Default to primary type if not specified
  const type = options.type || 'primary';
  
  // Get color based on type
  let color: number;
  if (options.color) {
    color = typeof options.color === 'string' ? parseInt(options.color.replace('#', ''), 16) : Number(options.color);
  } else {
    switch (type) {
      case 'success':
        color = Colors.SUCCESS;
        break;
      case 'error':
      case 'danger':
        color = Colors.ERROR;
        break;
      case 'warning':
        color = Colors.WARNING;
        break;
      case 'info':
        color = Colors.INFO;
        break;
      default:
        color = Colors.PRIMARY;
    }
  }

  // Create the embed
  const embed = new EmbedBuilder()
    .setColor(color);

  // Set title if provided
  if (options.title) {
    embed.setTitle(options.title);
  }

  // Set description if provided
  if (options.description) {
    embed.setDescription(options.description);
  }

  // Add fields if provided
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  // Set footer
  if (options.footer) {
    embed.setFooter({ text: options.footer });
  } else {
    embed.setFooter({ text: 'Powered by WardenPrime' });
  }

  // Set thumbnail if provided
  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  // Set image if provided
  if (options.image) {
    embed.setImage(options.image);
  }

  // Set author if provided
  if (options.author) {
    embed.setAuthor({
      name: options.author.name,
      iconURL: options.author.iconURL || DEFAULT_AUTHOR_ICON,
      url: options.author.url
    });
  } else {
    embed.setAuthor({
      name: 'WardenPrime',
      iconURL: DEFAULT_AUTHOR_ICON
    });
  }

  // Set timestamp if requested
  if (options.timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

/**
 * Create a standard embed with consistent styling (synchronous version)
 * This is an alias for backward compatibility
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
  guildId?: string;
}): EmbedBuilder {
  return createEmbed(options);
}

/**
 * Create a standard embed with guild-specific customization (async version)
 * This version fetches settings from the database
 */
export async function createEmbedAsync(options: {
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
  guildId?: string;
}): Promise<EmbedBuilder> {
  // Default to primary type if not specified
  const type = options.type || 'primary';
  
  // Get guild-specific colors if guildId is provided
  let colors = Colors;
  if (options.guildId && pgdb) {
    try {
      const guildColors = await pgdb.getEmbedColors(options.guildId);
      colors = {
        PRIMARY: parseInt(guildColors.primary.replace('#', ''), 16),
        SUCCESS: parseInt(guildColors.success.replace('#', ''), 16),
        ERROR: parseInt(guildColors.error.replace('#', ''), 16),
        WARNING: parseInt(guildColors.warning.replace('#', ''), 16),
        INFO: parseInt(guildColors.info.replace('#', ''), 16)
      };
    } catch (error) {
      logger.error('Error getting guild colors, using defaults:', error);
    }
  }
  
  // Get guild-specific settings if guildId is provided
  let settings = {
    footer: 'Powered by WardenPrime',
    authorName: 'WardenPrime',
    authorIcon: DEFAULT_AUTHOR_ICON,
    authorUrl: undefined as string | undefined,
    showTimestamp: false,
    showAuthor: true
  };
  
  if (options.guildId && pgdb) {
    try {
      const guildSettings = await pgdb.getAllEmbedSettings(options.guildId);
      settings = {
        footer: guildSettings.default_footer || 'Powered by WardenPrime',
        authorName: guildSettings.default_author_name || 'WardenPrime',
        authorIcon: guildSettings.default_author_icon || DEFAULT_AUTHOR_ICON,
        authorUrl: guildSettings.default_author_url,
        showTimestamp: guildSettings.show_timestamp === 'true',
        showAuthor: guildSettings.show_author === 'true'
      };
    } catch (error) {
      logger.error('Error getting guild settings, using defaults:', error);
    }
  }
  
  // Get color based on type
  let color: number;
  if (options.color) {
    color = typeof options.color === 'string' ? parseInt(options.color.replace('#', ''), 16) : Number(options.color);
  } else {
    switch (type) {
      case 'success':
        color = colors.SUCCESS;
        break;
      case 'error':
      case 'danger':
        color = colors.ERROR;
        break;
      case 'warning':
        color = colors.WARNING;
        break;
      case 'info':
        color = colors.INFO;
        break;
      default:
        color = colors.PRIMARY;
    }
  }

  // Create the embed
  const embed = new EmbedBuilder()
    .setColor(color);

  // Set title if provided
  if (options.title) {
    embed.setTitle(options.title);
  }

  // Set description if provided
  if (options.description) {
    embed.setDescription(options.description);
  }

  // Add fields if provided
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  // Set footer
  if (options.footer) {
    embed.setFooter({ text: options.footer });
  } else {
    embed.setFooter({ text: settings.footer });
  }

  // Set thumbnail if provided
  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  // Set image if provided
  if (options.image) {
    embed.setImage(options.image);
  }

  // Set author if provided or use guild settings
  if (options.author) {
    embed.setAuthor({
      name: options.author.name,
      iconURL: options.author.iconURL || settings.authorIcon,
      url: options.author.url
    });
  } else if (settings.showAuthor) {
    embed.setAuthor({
      name: settings.authorName,
      iconURL: settings.authorIcon,
      url: settings.authorUrl
    });
  }

  // Set timestamp if requested or if guild setting is enabled
  if (options.timestamp || settings.showTimestamp) {
    embed.setTimestamp();
  }

  return embed;
}