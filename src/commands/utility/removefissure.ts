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
    .setName('removefissure')
    .setDescription('Remove a specific fissure notification from this channel')
    .addStringOption(option => 
      option.setName('mission_type')
        .setDescription('Mission type to stop receiving notifications for')
        .setRequired(true)
        .addChoices(
          { name: 'Survival', value: 'Survival' },
          { name: 'Defense', value: 'Defense' },
          { name: 'Exterminate', value: 'Exterminate' },
          { name: 'Capture', value: 'Capture' },
          { name: 'Rescue', value: 'Rescue' },
          { name: 'Sabotage', value: 'Sabotage' },
          { name: 'Mobile Defense', value: 'Mobile Defense' },
          { name: 'Spy', value: 'Spy' },
          { name: 'Interception', value: 'Interception' },
          { name: 'Excavation', value: 'Excavation' },
          { name: 'Disruption', value: 'Disruption' },
          { name: 'Void Cascade', value: 'Void Cascade' },
          { name: 'Void Flood', value: 'Void Flood' },
          { name: 'Void Armageddon', value: 'Void Armageddon' }
        ))
    .addBooleanOption(option =>
      option.setName('steel_path')
        .setDescription('Specify if removing Steel Path notifications')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const missionType = interaction.options.getString('mission_type', true);
      const steelPath = interaction.options.getBoolean('steel_path');
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Check if a configuration exists
      const existingConfigs = await db.findBy('fissureNotifications', 'guildId', guildId);
      
      // Filter based on provided parameters
      const targetConfig = existingConfigs.find(
        (config: any) => config.missionType === missionType && 
                         config.channelId === channelId &&
                         (steelPath === null || config.steelPath === steelPath || 
                          (steelPath === false && config.steelPath === undefined))
      );
      
      if (!targetConfig) {
        // No configuration found for this mission type in this channel
        const steelPathText = steelPath !== null ? (steelPath ? " Steel Path" : " non-Steel Path") : "";
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'No Notification Found',
          description: `This channel is not currently receiving notifications for **${missionType}**${steelPathText} fissure missions.`,
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Delete the configuration
      await db.deleteOne('fissureNotifications', 'id', targetConfig.id);
      
      const steelPathInfo = targetConfig.steelPath ? " Steel Path" : "";
      logger.info(`Removed${steelPathInfo} fissure notification for guild ${guildId}, mission type ${missionType} from channel ${channelId}`);
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Fissure Notification Removed',
        description: `Notifications for **${missionType}**${steelPathInfo} fissure missions will no longer be sent to this channel.`,
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
    } catch (error) {
      logger.error('Error in removefissure command:', error);
      await interaction.editReply('An error occurred while removing the fissure notification. Please try again later.');
    }
  }
};

export = command; 