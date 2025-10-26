import { SlashCommandBuilder, PermissionFlagsBits, GuildMember, User } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { pgdb } from '../../services/postgresDatabase';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';
import { ensureUserExists, ensureGuildExists } from '../../utils/dbHelpers';
import { ChatInputCommandInteraction } from 'discord.js';
import { getServerNickname } from '../../utils/nicknameHelper';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unwarnall')
    .setDescription('Removes all warnings from a user')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user to remove all warnings from')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('The reason for removing all warnings')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    // Check if this is in a guild
    if (!interaction.guild || !interaction.member) {
      logger.warn(`Unwarnall command used outside of a guild by ${interaction.user.tag}`);
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'This command can only be used in a server.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check for database availability
    if (!pgdb) {
      logger.error('Database not available for unwarnall command');
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Database Error',
          description: 'The database is not available. This command requires database access.',
          timestamp: true
        })]
      });
      return;
    }
    
    try {
      // Get the target user and reason
      const user = interaction.options.getUser('user')!;
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      // Ensure guild and user exist in the database
      await ensureGuildExists(interaction.guild);
      await ensureUserExists(interaction.user);
      await ensureUserExists(user);
      
      // Check for appropriate permissions
      const member = interaction.member as GuildMember;
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Permission Denied',
            description: 'You must have the `Moderate Members` permission to use this command.',
            timestamp: true
          })]
        });
        return;
      }
      
      // Get the user's active warnings count first
      const warningCountResult = await pgdb.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM warnings 
         WHERE user_id = $1 AND guild_id = $2 AND active = true`,
        [user.id, interaction.guild.id]
      );
      
      const warningCount = parseInt(warningCountResult[0]?.count || '0');
      
      if (warningCount === 0) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'info',
            title: 'No Warnings',
            description: `${user.tag} has no active warnings to remove.`,
            timestamp: true
          })]
        });
        return;
      }
      
      // Get all warning IDs to log them in mod_logs
      const warningIdsResult = await pgdb.query<{ id: number }>(
        `SELECT id FROM warnings 
         WHERE user_id = $1 AND guild_id = $2 AND active = true`,
        [user.id, interaction.guild.id]
      );
      
      const warningIds = warningIdsResult.map(w => w.id);
      
      // Remove all warnings by setting active = false
      await pgdb.query(
        `UPDATE warnings SET active = false 
         WHERE user_id = $1 AND guild_id = $2 AND active = true`,
        [user.id, interaction.guild.id]
      );
      
      // Send success message
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'All Warnings Removed',
          description: `All warnings (${warningCount}) have been removed from **${user.tag}**.`,
          fields: [
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false },
          ],
          timestamp: true
        })]
      });
      
      // Log the action
      logger.info(`${interaction.user.tag} removed all warnings (${warningCount}) from ${user.tag} in ${interaction.guild.name} (${interaction.guild.id}). Reason: ${reason}`);
      
      // Try to notify the user via DM
      try {
        // Get server nicknames for personalized message
        const userNickname = await getServerNickname(interaction.client, interaction.guild.id, user.id);
        const moderatorNickname = await getServerNickname(interaction.client, interaction.guild.id, interaction.user.id);
        
        await user.send({
          embeds: [createEmbed({
            type: 'success',
            title: 'All Warnings Cleared',
            description: `Hello ${userNickname}, all your warnings have been removed in **${interaction.guild.name}**.`,
            fields: [
              { name: 'Moderator (Mention)', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Moderator (Name)', value: moderatorNickname, inline: true },
              { name: 'Reason', value: reason, inline: false }
            ],
            timestamp: true
          })]
        });
      } catch (error) {
        // Silently fail if we can't DM the user
        logger.debug(`Unwarnall command: Failed to DM ${user.id} about warnings removal:`, error);
      }
      
    } catch (error) {
      logger.error('Error executing unwarnall command:', error);
      
      // Reply with an error message
      try {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while removing warnings.',
            timestamp: true
          })]
        });
      } catch (replyError) {
        logger.error('Failed to edit reply with error message:', replyError);
      }
    }
  }
};

export = command; 