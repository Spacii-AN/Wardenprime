import { Events, VoiceState, EmbedBuilder, TextChannel } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';

// Event fired when a user's voice state changes
export const name = Events.VoiceStateUpdate;

export const execute: Event<typeof Events.VoiceStateUpdate>['execute'] = async (oldState: VoiceState, newState: VoiceState) => {
  // Log every voice state update for debugging
  logger.debug(`Voice state update received - User: ${newState.member?.user.tag || 'Unknown'}, Guild: ${newState.guild.name}`);
  
  // Skip bot users
  if (oldState.member?.user.bot) {
    logger.debug('Skipping voice state update for bot user');
    return;
  }
  
  try {
    // Check if database is available
    if (!pgdb) {
      logger.error(`Database connection not available for voice log in guild ${oldState.guild.id}`);
      return;
    }
    
    // Get the guild settings to check for log channel
    logger.debug(`Fetching guild settings for guild ${oldState.guild.id}`);
    const guildSettings = await pgdb.getGuildSettings(oldState.guild.id);
    
    if (!guildSettings) {
      logger.debug(`No guild settings found for guild ${oldState.guild.id}`);
      return;
    }
    
    if (!guildSettings.log_channel_id) {
      logger.debug(`No log channel set for guild ${oldState.guild.id}`);
      return;
    }
    
    // Get the log channel
    const logChannel = oldState.guild.channels.cache.get(guildSettings.log_channel_id);
    if (!logChannel) {
      logger.debug(`Could not find log channel with ID ${guildSettings.log_channel_id}`);
      return;
    }
    
    if (!logChannel.isTextBased()) {
      logger.debug(`Log channel ${guildSettings.log_channel_id} is not a text channel`);
      return;
    }
    
    const textLogChannel = logChannel as TextChannel;
    logger.debug(`Successfully found log channel: ${textLogChannel.name}`);
    
    // Detect what type of event occurred
    let eventType = 'unknown';
    if (!oldState.channelId && newState.channelId) {
      eventType = 'join';
    } else if (oldState.channelId && !newState.channelId) {
      eventType = 'leave';
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      eventType = 'switch';
    } else if (oldState.channelId && newState.channelId && oldState.channelId === newState.channelId) {
      if (oldState.mute !== newState.mute) {
        eventType = newState.mute ? 'mute' : 'unmute';
      } else if (oldState.deaf !== newState.deaf) {
        eventType = newState.deaf ? 'deafen' : 'undeafen';
      }
    }
    
    logger.debug(`Voice event type: ${eventType} for user ${newState.member?.user.tag}`);
    
    // Check if this specific voice activity type is enabled
    if (eventType === 'join' || eventType === 'switch') {
      const isVoiceJoinLoggingEnabled = await pgdb.isLogTypeEnabled(oldState.guild.id, 'voice_join');
      if (!isVoiceJoinLoggingEnabled) {
        logger.debug(`Voice join logging is disabled for guild ${oldState.guild.id}`);
        return;
      }
    } else if (eventType === 'leave') {
      const isVoiceLeaveLoggingEnabled = await pgdb.isLogTypeEnabled(oldState.guild.id, 'voice_leave');
      if (!isVoiceLeaveLoggingEnabled) {
        logger.debug(`Voice leave logging is disabled for guild ${oldState.guild.id}`);
        return;
      }
    }
    
    // User joined a voice channel
    if (eventType === 'join') {
      const embed = new EmbedBuilder()
        .setColor('#57F287')  // Green
        .setTitle('Voice Channel Joined')
        .setAuthor({
          name: ' ',
          iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
        })
        .setDescription(`<@${newState.member!.id}> joined voice channel <#${newState.channelId}>`)
        .addFields(
          { name: 'User', value: `<@${newState.member!.id}> (${newState.member!.user.tag})`, inline: true },
          { name: 'Channel', value: `<#${newState.channelId}>`, inline: true }
        )
        .setTimestamp();
        
      logger.debug(`Sending voice join log to channel ${textLogChannel.name}`);
      await textLogChannel.send({ embeds: [embed] });
      logger.info(`User ${newState.member!.user.tag} joined voice channel ${newState.channel?.name}`);
    }
    
    // User left a voice channel
    else if (eventType === 'leave') {
      const embed = new EmbedBuilder()
        .setColor('#ED4245')  // Red
        .setTitle('Voice Channel Left')
        .setAuthor({
          name: ' ',
          iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
        })
        .setDescription(`<@${oldState.member!.id}> left voice channel <#${oldState.channelId}>`)
        .addFields(
          { name: 'User', value: `<@${oldState.member!.id}> (${oldState.member!.user.tag})`, inline: true },
          { name: 'Channel', value: `<#${oldState.channelId}>`, inline: true }
        )
        .setTimestamp();
        
      logger.debug(`Sending voice leave log to channel ${textLogChannel.name}`);
      await textLogChannel.send({ embeds: [embed] });
      logger.info(`User ${oldState.member!.user.tag} left voice channel ${oldState.channel?.name}`);
    }
    
    // User switched voice channels
    else if (eventType === 'switch') {
      const embed = new EmbedBuilder()
        .setColor('#FEE75C')  // Yellow
        .setTitle('Voice Channel Switched')
        .setAuthor({
          name: ' ',
          iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
        })
        .setDescription(`<@${newState.member!.id}> switched voice channels`)
        .addFields(
          { name: 'User', value: `<@${newState.member!.id}> (${newState.member!.user.tag})`, inline: true },
          { name: 'From', value: `<#${oldState.channelId}>`, inline: true },
          { name: 'To', value: `<#${newState.channelId}>`, inline: true }
        )
        .setTimestamp();
        
      await textLogChannel.send({ embeds: [embed] });
      logger.info(`User ${newState.member!.user.tag} switched from ${oldState.channel?.name} to ${newState.channel?.name}`);
    }
    
    // Check for mute/deafen status changes (if in same channel)
    else if (eventType === 'mute' || eventType === 'unmute' || eventType === 'deafen' || eventType === 'undeafen') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')  // Blue
        .setTitle(eventType.charAt(0).toUpperCase() + eventType.slice(1))
        .setAuthor({
          name: ' ',
          iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
        })
        .setDescription(`<@${newState.member!.id}> was ${eventType} in <#${newState.channelId}>`)
        .addFields(
          { name: 'User', value: `<@${newState.member!.id}> (${newState.member!.user.tag})`, inline: true },
          { name: 'Channel', value: `<#${newState.channelId}>`, inline: true },
          { name: 'Status', value: eventType === 'mute' ? '🔇 Muted' : eventType === 'unmute' ? '🔊 Unmuted' : eventType === 'deafen' ? '🔇 Deafened' : '🔊 Undeafened', inline: true }
        )
        .setTimestamp();
        
      await textLogChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error(`Error logging voice state update: ${error instanceof Error ? error.message : String(error)}`);
  }
}; 