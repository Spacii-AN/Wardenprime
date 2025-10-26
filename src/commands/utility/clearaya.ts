import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('clearaya')
    .setDescription('Remove Aya bounty notifications from this server')
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
      
      // Check if a configuration exists
      const existingConfigs = await pgdb.getAyaNotifications();
      const existingConfig = existingConfigs.find(config => config.guild_id === guildId);
      
      if (!existingConfig) {
        // No configuration found
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'No Aya Bounty Configuration Found',
          description: 'This server has no active Aya bounty notifications to remove.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Get the channel ID for display purposes
      const channelId = existingConfig.channel_id;
      
      // Delete the configuration from PostgreSQL
      await pgdb.query('DELETE FROM aya_notifications WHERE guild_id = $1', [guildId]);
      
      logger.info(`Removed Aya bounty notifications for guild ${guildId}`);
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Aya Bounty Notifications Removed',
        description: 'Warframe Aya bounty updates will no longer be sent to this server.',
        fields: [
          {
            name: 'Previous Channel',
            value: channelId ? `<#${channelId}>` : 'Unknown',
            inline: true
          }
        ],
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
    } catch (error) {
      logger.error('Error in clearaya command:', error);
      await interaction.editReply('An error occurred while removing Aya bounty notifications. Please try again later.');
    }
  }
};

// Export the command in the format expected by the command loader
export = command; 