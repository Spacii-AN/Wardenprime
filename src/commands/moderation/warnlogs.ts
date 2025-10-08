import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { pgdb } from '../../services/postgresDatabase';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';
import { ChatInputCommandInteraction } from 'discord.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warnlogs')
    .setDescription('View warning logs for a user')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user to view warnings for')
        .setRequired(false)
    )
    .addStringOption(option => 
      option
        .setName('userid')
        .setDescription('The ID of the user to view warnings for (use this for users not in server)')
        .setRequired(false)
    )
    .addBooleanOption(option => 
      option
        .setName('show_inactive')
        .setDescription('Show inactive warnings as well')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Check if interaction is in a guild
    if (!interaction.guild || !interaction.member) {
      logger.warn(`Warnlogs command used outside of a guild by ${interaction.user.tag}`);
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'This command can only be used in a server.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }

    // Check for database availability
    if (!pgdb) {
      logger.error('Database not available for warnlogs command');
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Database Error',
          description: 'The database is not available. This command requires database access.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }

    // Log command start
    logger.debug(`Warnlogs command initiated by ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Only run if using PostgreSQL
      if (config.DATABASE_TYPE !== 'postgres') {
        logger.debug('Warnlogs command: Requires PostgreSQL database');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Database Error',
            description: `This command requires PostgreSQL, but you're using ${config.DATABASE_TYPE}`,
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Get options
      const targetUser = interaction.options.getUser('user');
      const userId = interaction.options.getString('userid');
      const showInactive = interaction.options.getBoolean('show_inactive') || false;
      
      // Validate at least one user identifier was provided
      if (!targetUser && !userId) {
        logger.debug('Warnlogs command: No user or user ID provided');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'You must provide either a user or a user ID',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // If both were provided, prioritize the user mention
      const targetId = targetUser ? targetUser.id : userId;
      const displayName = targetUser ? targetUser.tag : `User ID: ${targetId}`;
      
      // Validate user ID format if provided
      if (userId && !/^\d{17,20}$/.test(userId)) {
        logger.debug(`Warnlogs command: Invalid user ID format: ${userId}`);
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
      
      logger.debug(`Warnlogs command: Fetching warnings for ${displayName} (${targetId}), show_inactive=${showInactive}`);
      
      // Build the query based on whether to show inactive warnings
      let query = 'SELECT w.id, w.reason, w.active, w.created_at, u.username as moderator_name ';
      query += 'FROM warnings w ';
      query += 'LEFT JOIN users u ON w.moderator_id = u.id ';
      query += 'WHERE w.user_id = $1 AND w.guild_id = $2 ';
      
      if (!showInactive) {
        query += 'AND w.active = true ';
      }
      
      query += 'ORDER BY w.created_at DESC';
      
      // Get warnings
      const warnings = await pgdb.query<{
        id: number, 
        reason: string, 
        active: boolean, 
        created_at: string, 
        moderator_name: string
      }>(query, [targetId, interaction.guild.id]);
      
      if (warnings.length === 0) {
        logger.debug(`Warnlogs command: No${showInactive ? '' : ' active'} warnings found for ${targetId}`);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'info',
            title: 'No Warnings',
            description: `${displayName} has no${showInactive ? '' : ' active'} warnings in this server.`,
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Format date helper function
      const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
      };
      
      // Create warning list
      const warningsList = warnings.map((warning) => {
        return `**#${warning.id}** ${warning.active ? '🟢' : '🔴'} | ${formatDate(warning.created_at)}\n` +
               `By: ${warning.moderator_name || 'Unknown'}\n` +
               `Reason: ${warning.reason}\n`;
      }).join('\n');
      
      // Count warnings
      const activeCount = warnings.filter(w => w.active).length;
      logger.debug(`Warnlogs command: Found ${activeCount} active and ${warnings.length - activeCount} inactive warnings for ${targetId}`);
      
      // Send the embed with warning logs
      await interaction.reply({ 
        embeds: [createEmbed({
          type: 'info',
          title: `Warning Logs - ${displayName}`,
          description: warningsList,
          fields: [
            { 
              name: 'Summary', 
              value: `Active: ${activeCount} | Total: ${warnings.length}`,
              inline: false
            }
          ],
          footer: `User ID: ${targetId}`,
          timestamp: true
        })],
        ephemeral: true 
      });
      
      logger.debug(`Warnlogs command: Successfully displayed ${warnings.length} warnings for ${targetId}`);
    } catch (error) {
      logger.error('Warnlogs command error:', error);
      
      // Try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while fetching warning logs',
            timestamp: true
          })],
          ephemeral: true 
        });
      }
    }
  }
};

export = command; 