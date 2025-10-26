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
    .setName('clearincarnon')
    .setDescription('Remove all Incarnon Evolution notifications from this server')
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
      const existingConfigs = await pgdb.getIncarnonNotifications();
      // Filter for this guild only
      const guildConfigs = existingConfigs.filter(config => config.guild_id === guildId);
      
      if (guildConfigs.length === 0) {
        // No configurations found
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'No Incarnon Evolution Notifications Found',
          description: 'This server has no active Incarnon Evolution notifications to remove.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Count before deletion for reporting
      const notificationCount = guildConfigs.length;
      
      // Delete all configurations for this guild using a single SQL query
      await pgdb.query('DELETE FROM incarnon_notifications WHERE guild_id = $1', [guildId]);
      
      logger.info(`Removed ${notificationCount} Incarnon Evolution notifications for guild ${guildId}`);
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Incarnon Evolution Notifications Cleared',
        description: `Successfully removed ${notificationCount} Incarnon Evolution notification${notificationCount !== 1 ? 's' : ''} from this server.`,
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
    } catch (error) {
      logger.error('Error in clearincarnon command:', error);
      await interaction.editReply('An error occurred while clearing Incarnon Evolution notifications. Please try again later.');
    }
  }
};

// Export the command in the format expected by the command loader
export = command; 