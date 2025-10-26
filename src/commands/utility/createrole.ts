import { SlashCommandBuilder, ChatInputCommandInteraction, Role, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types/discord';

// Function to generate a random color
const getRandomColor = (): number => Math.floor(Math.random() * 16777215);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('createrole')
    .setDescription('Creates multiple roles with random colors')
    .addStringOption(option =>
      option.setName('names')
        .setDescription('Comma-separated list of role names')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    if (!interaction.guild) {
      await interaction.editReply('This command must be used in a server.');
      return;
    }
    
    const roleNames = interaction.options.getString('names')?.split(',').map(name => name.trim()) || [];
    
    try {
      const createdRoles: Role[] = [];
      for (const name of roleNames) {
        const role = await interaction.guild.roles.create({
          name,
          color: getRandomColor(),
          reason: 'Bulk role creation via /createrole command'
        });
        createdRoles.push(role);
      }
      
      await interaction.editReply(`Successfully created roles: ${createdRoles.map(role => role.name).join(', ')}`);
    } catch (error) {
      console.error('Error creating roles:', error);
      await interaction.editReply('An error occurred while creating roles.');
    }
  }
};

export = command;