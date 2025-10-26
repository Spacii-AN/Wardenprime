import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, Role } from 'discord.js';
import { Command } from '../../types/discord';
import { PermissionRole, addPermissionRole, removePermissionRole, getGuildPermissionRoles, setPermissionRoles } from '../../services/permissionService';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('modroles')
    .setDescription('Configure which roles have moderation permissions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a role to a permission group')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('The type of permission')
            .setRequired(true)
            .addChoices(
              { name: 'Admin', value: PermissionRole.ADMIN },
              { name: 'Moderator', value: PermissionRole.MODERATOR },
              { name: 'Scheduler', value: PermissionRole.SCHEDULER },
              { name: 'Logger', value: PermissionRole.LOGGER }
            )
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to add')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from a permission group')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('The type of permission')
            .setRequired(true)
            .addChoices(
              { name: 'Admin', value: PermissionRole.ADMIN },
              { name: 'Moderator', value: PermissionRole.MODERATOR },
              { name: 'Scheduler', value: PermissionRole.SCHEDULER },
              { name: 'Logger', value: PermissionRole.LOGGER }
            )
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all roles with special permissions')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply('This command must be used in a server.');
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        await handleAddRole(interaction);
      } else if (subcommand === 'remove') {
        await handleRemoveRole(interaction);
      } else if (subcommand === 'list') {
        await handleListRoles(interaction);
      }
    } catch (error) {
      logger.error(`Error in modroles command (${subcommand}):`, error);
      await interaction.editReply('An error occurred while processing the command.');
    }
  }
};

async function handleAddRole(interaction: ChatInputCommandInteraction): Promise<void> {
  const permissionType = interaction.options.getString('type') as PermissionRole;
  const role = interaction.options.getRole('role') as Role;

  // Check if role is valid
  if (!role) {
    await interaction.editReply('Please provide a valid role.');
    return;
  }

  // Add role to permission group
  const success = await addPermissionRole(interaction.guild!.id, permissionType, role.id);

  if (success) {
    const embed = createEmbed({
      type: 'success',
      title: 'Role Added',
      description: `Added <@&${role.id}> to the **${permissionType}** permission group.`,
      fields: [
        { name: 'Role', value: role.name, inline: true },
        { name: 'Permission Type', value: permissionType, inline: true }
      ],
      timestamp: true
    });

    await interaction.editReply({ embeds: [embed] });
    logger.info(`User ${interaction.user.tag} added role ${role.name} (${role.id}) to ${permissionType} permission group in guild ${interaction.guild!.name} (${interaction.guild!.id})`);
  } else {
    await interaction.editReply('Failed to add role to permission group. Please try again.');
  }
}

async function handleRemoveRole(interaction: ChatInputCommandInteraction): Promise<void> {
  const permissionType = interaction.options.getString('type') as PermissionRole;
  const role = interaction.options.getRole('role') as Role;

  // Check if role is valid
  if (!role) {
    await interaction.editReply('Please provide a valid role.');
    return;
  }

  // Remove role from permission group
  const success = await removePermissionRole(interaction.guild!.id, permissionType, role.id);

  if (success) {
    const embed = createEmbed({
      type: 'success',
      title: 'Role Removed',
      description: `Removed <@&${role.id}> from the **${permissionType}** permission group.`,
      fields: [
        { name: 'Role', value: role.name, inline: true },
        { name: 'Permission Type', value: permissionType, inline: true }
      ],
      timestamp: true
    });

    await interaction.editReply({ embeds: [embed] });
    logger.info(`User ${interaction.user.tag} removed role ${role.name} (${role.id}) from ${permissionType} permission group in guild ${interaction.guild!.name} (${interaction.guild!.id})`);
  } else {
    await interaction.editReply('Failed to remove role from permission group. Please try again.');
  }
}

async function handleListRoles(interaction: ChatInputCommandInteraction): Promise<void> {
  // Get all permission roles
  const guildPermissions = await getGuildPermissionRoles(interaction.guild!.id);
  const fields = [];

  // Create fields for each permission type
  for (const permType of Object.values(PermissionRole)) {
    const roleIds = guildPermissions.roles[permType] || [];
    let value = 'None';

    if (roleIds.length > 0) {
      value = roleIds.map(id => `<@&${id}>`).join('\n');
    }

    fields.push({
      name: `${permType.charAt(0).toUpperCase() + permType.slice(1)} Roles`,
      value,
      inline: false
    });
  }

  const embed = createEmbed({
    type: 'info',
    title: 'Permission Roles',
    description: 'These roles have special permissions on this server:',
    fields,
    footer: 'Users with these roles can use associated commands.',
    timestamp: true
  });

  await interaction.editReply({ embeds: [embed] });
}

export = command; 