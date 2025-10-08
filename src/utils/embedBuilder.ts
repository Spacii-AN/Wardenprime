import { EmbedBuilder, ColorResolvable } from 'discord.js';

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