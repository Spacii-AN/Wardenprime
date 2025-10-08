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
    .setName('clearfissures')
    .setDescription('Remove all fissure notifications from this server')
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
      
      // Check if any configurations exist in PostgreSQL
      const existingConfigs = await pgdb.getFissureNotifications();
      const guildConfigs = existingConfigs.filter(config => config.guild_id === guildId);
      
      if (guildConfigs.length === 0) {
        // No configurations found
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'No Fissure Notifications Found',
          description: 'This server has no active fissure notifications to remove.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Count before deletion for reporting
      const notificationCount = guildConfigs.length;
      const steelPathCount = guildConfigs.filter(config => config.steel_path).length;
      
      // Delete all configurations for this guild using a single SQL query
      await pgdb.query('DELETE FROM fissure_notifications WHERE guild_id = $1', [guildId]);
      
      logger.info(`Removed ${notificationCount} fissure notifications (${steelPathCount} Steel Path) for guild ${guildId}`);
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Fissure Notifications Cleared',
        description: `Successfully removed ${notificationCount} fissure notification${notificationCount !== 1 ? 's' : ''} from this server.`,
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
    } catch (error) {
      logger.error('Error in clearfissures command:', error);
      await interaction.editReply('An error occurred while clearing fissure notifications. Please try again later.');
    }
  }
};

export = command; 