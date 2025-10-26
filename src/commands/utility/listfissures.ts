import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';
import { Command } from '../../types/discord';
import { db } from '../../services/database';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('listfissures')
    .setDescription('List all fissure notifications configured for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const guildId = interaction.guildId;
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Get all fissure configurations for this guild
      const fissureConfigs = await db.findBy('fissureNotifications', 'guildId', guildId);
      
      if (fissureConfigs.length === 0) {
        // No configurations found
        const infoEmbed = createEmbed({
          type: 'info',
          title: 'No Fissure Notifications',
          description: 'This server has no active fissure notifications configured.\n\nUse `/setfissure` to set up notifications for specific mission types.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [infoEmbed] });
        return;
      }
      
      // Group configurations by channel
      const channelConfigs: Record<string, any[]> = {};
      
      fissureConfigs.forEach((config: any) => {
        if (!channelConfigs[config.channelId]) {
          channelConfigs[config.channelId] = [];
        }
        channelConfigs[config.channelId].push(config);
      });
      
      // Create fields for each channel
      const fields = Object.entries(channelConfigs).map(([channelId, configs]) => {
        const missionsList = configs.map((config: any) => {
          const roleText = config.roleId ? `<@&${config.roleId}>` : 'No role';
          const steelPathText = config.steelPath ? " (Steel Path)" : "";
          return `• **${config.missionType}${steelPathText}** - ${roleText}`;
        }).join('\n');
        
        return {
          name: `Channel: <#${channelId}>`,
          value: missionsList,
          inline: false
        };
      });
      
      // Create the embed
      const listEmbed = createEmbed({
        type: 'info',
        title: 'Fissure Notifications',
        description: `This server has ${fissureConfigs.length} fissure notification${fissureConfigs.length > 1 ? 's' : ''} configured.`,
        fields,
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [listEmbed] });
      
    } catch (error) {
      logger.error('Error in listfissures command:', error);
      await interaction.editReply('An error occurred while listing fissure notifications. Please try again later.');
    }
  }
};

export = command; 