import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { pgdb } from '../../services/postgresDatabase';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';
import { ensureUserExists, ensureGuildExists } from '../../utils/dbHelpers';
import { ChatInputCommandInteraction } from 'discord.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issues a warning to a user')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('The reason for the warning')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Check if interaction is in a guild
    if (!interaction.guild || !interaction.member) {
      logger.warn(`Warn command used outside of a guild by ${interaction.user.tag}`);
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
      logger.error('Database not available for warn command');
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
    logger.debug(`Warn command initiated by ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Only run if using PostgreSQL
      if (config.DATABASE_TYPE !== 'postgres') {
        logger.debug('Warn command: Requires PostgreSQL database');
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
      
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      if (!targetUser) {
        logger.debug('Warn command: Target user not provided');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'User not found',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      logger.debug(`Warn command: Targeting user ${targetUser.tag} (${targetUser.id})`);
      
      // Get target member
      const targetMember = interaction.guild.members.cache.get(targetUser.id);
      
      if (!targetMember) {
        logger.debug(`Warn command: Target member ${targetUser.id} not found in guild`);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'User not found in this server',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Check if the user is trying to warn themselves
      if (targetUser.id === interaction.user.id) {
        logger.debug('Warn command: User attempted to warn themselves');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'You cannot warn yourself',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Check if the user is trying to warn someone with higher permissions
      const member = interaction.member as GuildMember;
      if (
        targetMember.roles.highest.position >= member.roles.highest.position &&
        interaction.guild.ownerId !== member.id
      ) {
        logger.debug(`Warn command: Permission hierarchy prevents ${interaction.user.id} from warning ${targetUser.id}`);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Permission Error',
            description: 'You cannot warn someone with higher or equal permissions',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      logger.debug(`Warn command: Adding warning for ${targetUser.id} in database`);
      
      try {
        if (!pgdb) return; // Added null check before database operations
        
        // Ensure both users and guild exist in the database
        await ensureUserExists(targetUser);
        await ensureUserExists(interaction.user);
        await ensureGuildExists(interaction.guild);
        
        // Add the warning to the database
        const result = await pgdb.query<{ id: number }>(
          `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, active)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [interaction.guild.id, targetUser.id, interaction.user.id, reason]
        );
        
        // Count active warnings for this user
        const warningCount = await pgdb.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM warnings 
           WHERE user_id = $1 AND guild_id = $2 AND active = true`,
          [targetUser.id, interaction.guild.id]
        );
        
        const warningCountValue = parseInt(warningCount[0]?.count || '0');
        logger.debug(`Warn command: ${targetUser.id} now has ${warningCountValue} active warnings`);
        
        // Check if the user should be kicked (3 or more warnings)
        if (warningCountValue >= 3) {
          // Try to kick the user if they have 3 or more warnings
          if (targetMember.kickable) {
            logger.info(`Auto-kicking user ${targetUser.tag} (${targetUser.id}) from guild ${interaction.guild.name} (${interaction.guild.id}) after ${warningCountValue} warnings`);
            
            // Send a message to the user about auto-kick before kicking
            try {
              const dmEmbed = createEmbed({
                type: 'danger',
                title: 'You have been kicked',
                description: `You have been automatically kicked from **${interaction.guild.name}** after receiving ${warningCountValue} warnings.`,
                fields: [
                  { name: 'Latest Warning', value: reason, inline: true },
                  { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
                ],
                timestamp: true
              });
              
              await targetUser.send({ embeds: [dmEmbed] });
              logger.debug(`Warn command: DM sent to ${targetUser.id} about auto-kick`);
            } catch (error) {
              // Silently fail if we can't DM the user
              logger.debug(`Warn command: Failed to DM ${targetUser.id} about auto-kick:`, error);
            }
            
            // Now kick the user
            try {
              await targetMember.kick(`Automatic kick after receiving ${warningCountValue} warnings`);
              
              // Update warnings to inactive since action was taken
              await pgdb.query(
                'UPDATE warnings SET active = false WHERE user_id = $1 AND guild_id = $2',
                [targetUser.id, interaction.guild.id]
              );
              
              // Send message about the kick
              await interaction.reply({ 
                embeds: [createEmbed({
                  type: 'error',
                  title: 'User Kicked',
                  description: `${targetUser.tag} has been automatically kicked after receiving ${warningCountValue} warnings.`,
                  fields: [
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Warning Count', value: warningCountValue.toString(), inline: true },
                    { name: 'Latest Warning', value: reason }
                  ],
                  timestamp: true
                })],
                ephemeral: true 
              });
              
              logger.debug(`Warn command: Successfully auto-kicked ${targetUser.id}`);
              return;
            } catch (kickError) {
              logger.error(`Warn command: Error auto-kicking user ${targetUser.id}:`, kickError);
              // If kick fails, continue with normal warning process
            }
          }
        }
        
        // Send success message for warning
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'warning',
            title: 'User Warned',
            description: `${targetUser.tag} has been warned.`,
            fields: [
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Reason', value: reason },
              { name: 'Warning Count', value: warningCountValue.toString(), inline: true }
            ],
            timestamp: true
          })],
          ephemeral: true 
        });
        
        logger.debug(`Warn command: Successfully warned ${targetUser.id}`);
        
        // Try to DM the user about the warning
        try {
          const dmEmbed = createEmbed({
            type: 'warning',
            title: 'You have received a warning',
            description: `You have been warned in **${interaction.guild.name}**`,
            fields: [
              { name: 'Reason', value: reason, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Warning Count', value: warningCountValue.toString(), inline: true },
              { name: 'Note', value: 'Three warnings will result in an automatic kick from the server.' }
            ],
            timestamp: true
          });
          
          await targetUser.send({ embeds: [dmEmbed] });
          logger.debug(`Warn command: DM sent to ${targetUser.id}`);
        } catch (error) {
          // Silently fail if we can't DM the user
          logger.debug(`Warn command: Failed to DM ${targetUser.id}:`, error);
        }
      } catch (error) {
        logger.error('Warn command error:', error);
        
        // Try to reply if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            embeds: [createEmbed({
              type: 'error',
              title: 'Error',
              description: 'An error occurred while warning the user',
              timestamp: true
            })],
            ephemeral: true 
          });
        }
      }
    } catch (error) {
      logger.error('Warn command error:', error);
      
      // Try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while warning the user',
            timestamp: true
          })],
          ephemeral: true 
        });
      }
    }
  }
};

export = command; 