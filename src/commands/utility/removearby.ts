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
    .setName('removearby')
    .setDescription('Stop receiving Arbitration notifications in this server')
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
      const existingConfig = await db.findBy('arbyChannels', 'guildId', guildId);
      
      if (existingConfig.length === 0) {
        await interaction.editReply('This server is not currently receiving Arbitration notifications.');
        return;
      }
      
      // Delete the configuration
      const deleted = await db.deleteOne('arbyChannels', 'guildId', guildId);
      
      if (deleted) {
        logger.info(`Removed arbitration notifications for guild ${guildId}`);
        
        const successEmbed = createEmbed({
          type: 'success',
          title: 'Arbitration Notifications Disabled',
          description: 'This server will no longer receive automatic Warframe Arbitration updates.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        logger.error(`Failed to remove arbitration notifications for guild ${guildId}`);
        await interaction.editReply('An error occurred while disabling Arbitration notifications. Please try again later.');
      }
      
    } catch (error) {
      logger.error('Error in removearby command:', error);
      await interaction.editReply('An error occurred while disabling Arbitration notifications. Please try again later.');
    }
  }
};

// Export the command in the format expected by the command loader
export = command; 