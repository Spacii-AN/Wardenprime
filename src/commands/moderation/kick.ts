import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember, User } from 'discord.js';
import { Command } from '../../types/discord';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';
import { isModerator } from '../../services/permissionService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for kicking the user')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply('This command must be used in a server.');
      return;
    }

    // Check if user has custom permission
    const member = interaction.member as GuildMember;
    const hasModPerms = await isModerator(member);

    if (!hasModPerms && !member.permissions.has(PermissionFlagsBits.KickMembers)) {
      await interaction.editReply('You do not have permission to use this command. You need the Kick Members permission or a role configured as Admin/Moderator.');
      return;
    }

    // Get target user and reason
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!targetUser) {
      await interaction.editReply('User not found.');
      return;
    }

    // Check if user is trying to kick themselves
    if (targetUser.id === interaction.user.id) {
      await interaction.editReply('You cannot kick yourself.');
      return;
    }

    try {
      // Check if user is kickable
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch((): null => null);
      
      if (!targetMember) {
        await interaction.editReply('User is not a member of this server.');
        return;
      }
      
      // Check if the bot can kick the user
      if (!targetMember.kickable) {
        await interaction.editReply('I don\'t have permission to kick this user. They may have higher permissions than me.');
        return;
      }

      // Check if the target is also a moderator or has higher roles
      const targetIsModeration = await isModerator(targetMember);
      
      // Only check role hierarchy if the executor isn't an admin
      if (targetIsModeration && !await isAdminExecutor(member)) {
        await interaction.editReply('You cannot kick another moderator or admin.');
        return;
      }
      
      // Check if the user is trying to kick someone with higher permissions
      const executorMember = interaction.member as GuildMember;
      if (executorMember.roles.highest.position <= targetMember.roles.highest.position && 
          interaction.guild.ownerId !== executorMember.id) {
        await interaction.editReply('You cannot kick this user as they have higher or equal permissions to you.');
        return;
      }

      // Kick the user
      await targetMember.kick(`${reason} - Kicked by ${interaction.user.tag}`);
      
      // Log the action
      logger.info(`User ${targetUser.tag} (${targetUser.id}) was kicked by ${interaction.user.tag} (${interaction.user.id}) for: ${reason}`);

      // Create and send success embed
      const embed = createEmbed({
        type: 'success',
        title: 'User Kicked',
        description: `${targetUser.tag} has been kicked from the server.`,
        fields: [
          {
            name: 'User',
            value: `<@${targetUser.id}>`,
            inline: true
          },
          {
            name: 'Moderator',
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: 'Reason',
            value: reason,
            inline: false
          }
        ],
        timestamp: true
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error kicking user ${targetUser.id}:`, error);
      await interaction.editReply('An error occurred while trying to kick the user.');
    }
  }
};

// Helper function to check if the executor is an admin
async function isAdminExecutor(member: GuildMember): Promise<boolean> {
  // Server owner is always an admin
  if (member.guild.ownerId === member.id) {
    return true;
  }
  
  // Check if user has the Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  
  // Check if the user has the custom admin role
  return await import('../../services/permissionService').then(
    module => module.hasPermissionRole(member, module.PermissionRole.ADMIN)
  );
}

export = command; 