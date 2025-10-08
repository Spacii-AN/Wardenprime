import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unbans a user from the server')
    .addStringOption(option => 
      option
        .setName('userid')
        .setDescription('The ID of the user to unban')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('The reason for unbanning the user')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction) {
    // Log command start
    logger.debug(`Unban command initiated by ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Get the target user ID
      const userId = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      if (!userId) {
        logger.debug('Unban command: User ID not provided');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'User ID is required',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Validate that the user ID format is correct
      if (!/^\d{17,20}$/.test(userId)) {
        logger.debug(`Unban command: Invalid user ID format: ${userId}`);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'Invalid user ID format. User IDs are numeric and typically 17-20 digits long.',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Check if we have a guild
      if (!interaction.guild) {
        logger.error('Unban command: No guild available');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'This command can only be used in a server',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Get the ban list
      logger.debug(`Unban command: Fetching ban list for guild ${interaction.guild.id}`);
      const bans = await interaction.guild.bans.fetch();
      
      // Check if the user is banned
      if (!bans.has(userId)) {
        logger.debug(`Unban command: User ${userId} is not banned`);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'This user is not banned',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Get the banned user from the ban list
      const bannedUser = bans.get(userId);
      
      // Unban the user
      logger.info(`Unbanning user ${bannedUser?.user.tag || userId} (${userId}) from guild ${interaction.guild.name} (${interaction.guild.id})`);
      await interaction.guild.members.unban(userId, reason);
      
      // Send success message
      await interaction.reply({ 
        embeds: [createEmbed({
          type: 'success',
          title: 'User Unbanned',
          description: `${bannedUser?.user.tag || userId} has been unbanned from the server.`,
          fields: [
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason }
          ],
          timestamp: true
        })],
        ephemeral: true 
      });
      
      logger.debug(`Unban command: Successfully unbanned ${userId}`);
    } catch (error) {
      logger.error('Unban command error:', error);
      
      // Try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while unbanning the user',
            timestamp: true
          })],
          ephemeral: true 
        });
      }
    }
  }
};

export = command; 