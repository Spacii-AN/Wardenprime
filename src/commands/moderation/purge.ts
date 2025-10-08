import { SlashCommandBuilder, PermissionFlagsBits, TextChannel, ChannelType } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages from a channel')
    .addIntegerOption(option => 
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) as SlashCommandBuilder,
  
  cooldown: 5,
  
  async execute(interaction) {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    // Log command start
    logger.debug(`Purge command initiated by ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Check if we're in a guild
      if (!interaction.guild) {
        await interaction.editReply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'This command can only be used in a server',
            timestamp: true
          })]
        });
        return;
      }
      
      // Check if the channel is a text channel
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        await interaction.editReply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'This command can only be used in a text channel',
            timestamp: true
          })]
        });
        return;
      }
      
      const channel = interaction.channel as TextChannel;
      const amount = interaction.options.getInteger('amount', true);
      const targetUser = interaction.options.getUser('user');
      
      // Fetch messages to delete
      const messages = await channel.messages.fetch({ limit: amount });
      
      // If a user was specified, filter messages by that user
      const messagesToDelete = targetUser 
        ? messages.filter(msg => msg.author.id === targetUser.id)
        : messages;
      
      // Check if we have any messages to delete
      if (messagesToDelete.size === 0) {
        await interaction.editReply({ 
          embeds: [createEmbed({
            type: 'warning',
            title: 'No Messages Found',
            description: targetUser 
              ? `No recent messages from ${targetUser.tag} were found in this channel.`
              : 'No messages were found to delete.',
            timestamp: true
          })]
        });
        return;
      }
      
      // Discord's bulk delete only works on messages younger than 14 days
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
      
      if (recentMessages.size === 0) {
        await interaction.editReply({ 
          embeds: [createEmbed({
            type: 'warning',
            title: 'No Recent Messages',
            description: 'Cannot delete messages older than 14 days using bulk delete.',
            timestamp: true
          })]
        });
        return;
      }
      
      // Delete the messages
      const deletedCount = await channel.bulkDelete(recentMessages, true)
        .then(deleted => deleted.size)
        .catch(error => {
          logger.error(`Error bulk deleting messages:`, error);
          throw new Error('Failed to delete messages. They may be too old or I lack permissions.');
        });
      
      // Send confirmation
      await interaction.editReply({ 
        embeds: [createEmbed({
          type: 'success',
          title: 'Messages Deleted',
          description: targetUser
            ? `Successfully deleted ${deletedCount} message(s) from ${targetUser.tag}.`
            : `Successfully deleted ${deletedCount} message(s).`,
          fields: [
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            targetUser ? { name: 'Target User', value: `<@${targetUser.id}>`, inline: true } : null
          ].filter(Boolean) as { name: string, value: string, inline?: boolean }[],
          timestamp: true
        })]
      });
      
      logger.info(`${interaction.user.tag} purged ${deletedCount} messages ${targetUser ? `from ${targetUser.tag} ` : ''}in #${channel.name} (${channel.id})`);
    } catch (error) {
      logger.error('Purge command error:', error);
      
      // Try to reply if we haven't already
      await interaction.editReply({ 
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred while purging messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  }
};

export = command; 