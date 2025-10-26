import { Message, Events, ChannelType, PartialMessage, TextChannel, EmbedBuilder } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';
import { createEmbed } from '../utils/embedBuilder';
import { createRoleReactionButtons } from '../utils/roleReactions';
import { config } from '../config/config';

/**
 * Event handler for when a message is deleted
 * Handles cleanup of role reaction messages and logs deleted messages/images
 */
// Export the event properties directly
export const name = Events.MessageDelete;
export const once = false;

export const execute: Event<typeof Events.MessageDelete>['execute'] = async (message: Message<boolean> | PartialMessage) => {
  // Ignore DMs and messages from bots
  if (!message.guild || message.author?.bot) {
    return;
  }
  
  // Skip if PostgreSQL is not available
  if (!pgdb) {
    return;
  }
  
  try {
    // First, handle role reaction message deletion
    const roleReaction = await pgdb.getRoleReactionByMessage(message.id);
    
    if (roleReaction) {
      logger.info(`Role reaction message ${message.id} was deleted in Discord. Cleaning up database...`);
      
      // Delete the role reaction from the database
      await pgdb.deleteRoleReaction(roleReaction.id);
      
      logger.info(`Successfully deleted role reaction ${roleReaction.id} (${roleReaction.name}) from database after message was deleted in Discord`);
      
      // Try to notify the creator if possible
      try {
        const creator = await message.guild.members.fetch(roleReaction.creator_id);
        const notificationEmbed = createEmbed({
          title: 'Role Reaction Message Deleted',
          description: `Your role reaction message "${roleReaction.name}" was deleted, and has been removed from the database.`,
          color: 'Red'
        });
        
        creator.send({ embeds: [notificationEmbed] }).catch(() => {
          // Ignore errors sending DM
          logger.debug(`Could not send notification to creator ${roleReaction.creator_id}`);
        });
      } catch (error) {
        // Ignore errors fetching creator
        logger.debug(`Could not fetch creator ${roleReaction.creator_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Now, handle logging of the deleted message
    // Get guild settings to check for log channel
    const guildSettings = await pgdb.getGuildSettings(message.guild.id);
    if (!guildSettings?.log_channel_id) {
      return; // No log channel set
    }
    
    // Check if message delete logging is enabled
    const isMessageDeleteLoggingEnabled = await pgdb.isLogTypeEnabled(message.guild.id, 'message_delete');
    if (!isMessageDeleteLoggingEnabled) {
      logger.debug(`Message delete logging is disabled for guild ${message.guild.id}`);
      return;
    }
    
    // Get the log channel
    const logChannel = message.guild.channels.cache.get(guildSettings.log_channel_id);
    if (!logChannel?.isTextBased()) {
      return; // Invalid log channel
    }
    
    // Create the log embed
    const logEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Message Deleted')
      .setAuthor({
        name: ' ',
        iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
      })
      .setTimestamp()
      .addFields(
        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
        { name: 'Author', value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'Unknown User', inline: true }
      );
    
    // Add message content if available
    if (message.content) {
      // Truncate content if it's too long
      const content = message.content.length > 1024 
        ? message.content.substring(0, 1021) + '...' 
        : message.content;
      
      logEmbed.addFields({ name: 'Content', value: content });
    } else {
      logEmbed.addFields({ name: 'Content', value: '*No text content*' });
    }
    
    // Check for images and attachments
    if (message.attachments.size > 0) {
      const attachmentList: string[] = [];
      
      message.attachments.forEach(attachment => {
        const isImage = attachment.contentType?.startsWith('image/');
        
        if (isImage) {
          // Try to add the image as a thumbnail if it's the first image
          if (!logEmbed.data.thumbnail && attachment.proxyURL) {
            logEmbed.setThumbnail(attachment.proxyURL);
          }
          
          attachmentList.push(`📷 [Image: ${attachment.name}](${attachment.url})`);
        } else {
          attachmentList.push(`📎 [File: ${attachment.name}](${attachment.url})`);
        }
      });
      
      // Add the attachments field
      if (attachmentList.length > 0) {
        logEmbed.addFields({
          name: 'Attachments',
          value: attachmentList.join('\n')
        });
      }
    }
    
    // Send the log embed
    await (logChannel as TextChannel).send({ embeds: [logEmbed] });
    
  } catch (error) {
    logger.error(`Error handling deleted message: ${error instanceof Error ? error.message : String(error)}`);
  }
}; 