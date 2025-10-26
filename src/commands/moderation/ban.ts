import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getServerNickname } from '../../utils/nicknameHelper';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a user from the server')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('The reason for banning the user')
        .setRequired(false)
    )
    .addIntegerOption(option => 
      option
        .setName('days')
        .setDescription('Number of days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction) {
    // Log command start
    logger.debug(`Ban command initiated by ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const days = interaction.options.getInteger('days') || 0;
      
      if (!targetUser) {
        logger.debug('Ban command: Target user not provided');
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
      
      logger.debug(`Ban command: Targeting user ${targetUser.tag} (${targetUser.id})`);
      
      // Check if we have a guild
      if (!interaction.guild) {
        logger.error('Ban command: No guild available');
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
      
      // Check if the user is trying to ban themselves
      if (targetUser.id === interaction.user.id) {
        logger.debug('Ban command: User attempted to ban themselves');
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'You cannot ban yourself',
            timestamp: true
          })],
          ephemeral: true 
        });
        return;
      }
      
      // Get target member to check permissions - optional since user might not be in the server
      let targetMember: GuildMember | null = null;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch (error) {
        // User not in the server, can still be banned
        logger.debug(`Ban command: User ${targetUser.id} is not in the server, proceeding with ban`);
      }
      
      // If the user is in the server, check if they can be banned
      if (targetMember) {
        // Check if the user can be banned
        if (!targetMember.bannable) {
          logger.debug(`Ban command: Target member ${targetUser.id} is not bannable`);
          await interaction.reply({ 
            embeds: [createEmbed({
              type: 'error',
              title: 'Permission Error',
              description: 'I cannot ban this user. They may have higher permissions than me.',
              timestamp: true
            })],
            ephemeral: true 
          });
          return;
        }
        
        // Check if the user is trying to ban someone with higher permissions
        const member = interaction.member as GuildMember;
        if (
          targetMember.roles.highest.position >= member.roles.highest.position &&
          interaction.guild.ownerId !== member.id
        ) {
          logger.debug(`Ban command: Permission hierarchy prevents ${interaction.user.id} from banning ${targetUser.id}`);
          await interaction.reply({ 
            embeds: [createEmbed({
              type: 'error',
              title: 'Permission Error',
              description: 'You cannot ban someone with higher or equal permissions',
              timestamp: true
            })],
            ephemeral: true 
          });
          return;
        }
      }
      
      logger.info(`Banning user ${targetUser.tag} (${targetUser.id}) from guild ${interaction.guild.name} (${interaction.guild.id})`);
      
      // Send DM to user before banning if possible
      if (targetMember) {
        try {
          // Get server nickname for personalized message
          const userNickname = await getServerNickname(interaction.client, interaction.guild.id, targetUser.id);
          const moderatorNickname = await getServerNickname(interaction.client, interaction.guild.id, interaction.user.id);
          
          const dmEmbed = createEmbed({
            type: 'danger',
            title: 'You have been banned',
            description: `Hello ${userNickname}, you have been banned from **${interaction.guild.name}**`,
            fields: [
              { name: 'Moderator (Mention)', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Moderator (Name)', value: moderatorNickname, inline: true },
              { name: 'Reason', value: reason, inline: false }
            ],
            timestamp: true
          });
          
          await targetUser.send({ embeds: [dmEmbed] });
          logger.debug(`Ban command: DM sent to ${userNickname} (${targetUser.id})`);
        } catch (error) {
          // Silently fail if we can't DM the user
          logger.debug(`Ban command: Failed to DM ${targetUser.id}:`, error);
        }
      }
      
      // Ban the user
      try {
        await interaction.guild.members.ban(targetUser, {
          deleteMessageDays: days,
          reason: `Banned by ${interaction.user.tag}: ${reason}`
        });
        
        // Send success message
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'success',
            title: 'User Banned',
            description: `${targetUser.tag} has been banned from the server.`,
            fields: [
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Reason', value: reason, inline: true },
              { name: 'Message Days Deleted', value: `${days}`, inline: true }
            ],
            timestamp: true
          })],
          ephemeral: true 
        });
        
        logger.debug(`Ban command: Successfully banned ${targetUser.id}`);
      } catch (banError) {
        logger.error(`Ban command: Error banning user ${targetUser.id}:`, banError);
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while banning the user',
            timestamp: true
          })],
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Ban command error:', error);
      
      // Try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'An error occurred while banning the user',
            timestamp: true
          })],
          ephemeral: true 
        });
      }
    }
  }
};

export = command; 