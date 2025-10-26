import { SlashCommandBuilder, PermissionFlagsBits, GuildMember, User } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { pgdb } from '../../services/postgresDatabase';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';
import { ensureUserExists, ensureGuildExists } from '../../utils/dbHelpers';
import { ChatInputCommandInteraction } from 'discord.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Removes a warning from a user')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user to remove a warning from')
        .setRequired(false)
    )
    .addStringOption(option => 
      option
        .setName('userid')
        .setDescription('The ID of the user to remove a warning from (for users not in server)')
        .setRequired(false)
    )
    .addIntegerOption(option => 
      option
        .setName('warning_id')
        .setDescription('The ID of the warning to remove (use /warnlogs to see IDs)')
        .setRequired(false)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('The reason for removing the warning')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Check if this is in a guild
    if (!interaction.guild || !interaction.member) {
      logger.warn(`Unwarn command used outside of a guild by ${interaction.user.tag}`);
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
      logger.error('Database not available for unwarn command');
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
    
    // Get subcommand
    const subcommand = interaction.options.getSubcommand();
    
    try {
      // Store the interaction as a variable to avoid deferring multiple times
      await interaction.reply({
        embeds: [createEmbed({
          type: 'info',
          title: 'Processing',
          description: 'Processing your request...',
          timestamp: true
        })],
        ephemeral: true
      });
      
      // Ensure guild and user exist in the database
      await ensureGuildExists(interaction.guild);
      await ensureUserExists(interaction.user);
      
      switch (subcommand) {
        case 'latest':
          await handleLatestWarning(interaction);
          break;
        case 'specific':
          await handleSpecificWarning(interaction);
          break;
        default:
          await interaction.editReply({
            embeds: [createEmbed({
              type: 'error',
              title: 'Error',
              description: 'Unknown subcommand',
              timestamp: true
            })]
          });
          break;
      }
    } catch (error) {
      logger.error('Error executing unwarn command:', error);
      
      // Reply with an error message
      try {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while executing this command.',
            timestamp: true
          })]
        });
      } catch (replyError) {
        logger.error('Failed to edit reply with error message:', replyError);
      }
    }
  }
};

// Handles the 'latest' subcommand - removes the user's most recent warning
async function handleLatestWarning(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !pgdb) return;
  
  const user = interaction.options.getUser('user')!;
  const reason = interaction.options.getString('reason') || 'No reason provided';
  
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
  
  // Fetch the user's warnings
  const warningsResult = await pgdb.query<{ id: number, reason: string, created_at: string }>(
    `SELECT id, reason, created_at FROM warnings 
     WHERE user_id = $1 AND guild_id = $2 AND active = true 
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, interaction.guild.id]
  );
  
  if (warningsResult.length === 0) {
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
  
  const warning = warningsResult[0];
  
  // Remove the warning by setting active = false
  await pgdb.query(
    `UPDATE warnings SET active = false WHERE id = $1`,
    [warning.id]
  );
  
  // Get the warning count after removal
  const remainingWarnings = await pgdb.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM warnings WHERE user_id = $1 AND guild_id = $2 AND active = true`,
    [user.id, interaction.guild.id]
  );
  
  // Format the warning time for display
  const warningTime = new Date(warning.created_at).toLocaleString();
  
  // Send success message
  await interaction.editReply({
    embeds: [createEmbed({
      type: 'success',
      title: 'Warning Removed',
      description: `**${user.tag}**'s most recent warning has been removed.`,
      fields: [
        { name: 'Reason', value: reason, inline: false },
        { name: 'Removed Warning', value: warning.reason, inline: false },
        { name: 'Warning Time', value: warningTime, inline: true },
        { name: 'Remaining Warnings', value: remainingWarnings[0].count, inline: true }
      ],
      timestamp: true
    })]
  });
  
  // Log the action
  logger.info(`${interaction.user.tag} removed a warning from ${user.tag} in ${interaction.guild.name} (${interaction.guild.id}). Reason: ${reason}`);
}

// Handles the 'specific' subcommand - removes a warning by ID
async function handleSpecificWarning(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !pgdb) return;
  
  const warningId = interaction.options.getInteger('warning_id')!;
  const reason = interaction.options.getString('reason') || 'No reason provided';
  
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
  
  // Verify that the warning exists and belongs to this guild
  const specificWarning = await pgdb.query<{ id: number, user_id: string, username: string }>(
    `SELECT w.id, u.id as user_id, u.username
     FROM warnings w
     JOIN users u ON w.user_id = u.id
     WHERE w.id = $1 AND w.guild_id = $2 AND w.active = true`,
    [warningId, interaction.guild.id]
  );
  
  if (specificWarning.length === 0) {
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Warning Not Found',
        description: `Warning with ID ${warningId} was not found or is already inactive.`,
        timestamp: true
      })]
    });
    return;
  }
  
  // Remove the warning by setting active = false
  await pgdb.query(
    `UPDATE warnings SET active = false WHERE id = $1`,
    [warningId]
  );
  
  // Get the warning details
  await pgdb.query(
    `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [interaction.guild.id, specificWarning[0].user_id, interaction.user.id, 'unwarn', reason, warningId]
  );
  
  // Get the remaining warnings count
  const remainingWarnings = await pgdb.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM warnings WHERE user_id = $1 AND guild_id = $2 AND active = true`,
    [specificWarning[0].user_id, interaction.guild.id]
  );
  
  // Send success message
  await interaction.editReply({
    embeds: [createEmbed({
      type: 'success',
      title: 'Warning Removed',
      description: `Warning with ID ${warningId} has been removed.`,
      fields: [
        { name: 'Reason', value: reason, inline: false },
        { name: 'Remaining Warnings', value: remainingWarnings[0].count, inline: true }
      ],
      timestamp: true
    })]
  });
  
  // Log the action
  logger.info(`${interaction.user.tag} removed warning ${warningId} in ${interaction.guild.name} (${interaction.guild.id}). Reason: ${reason}`);
}

export = command; 