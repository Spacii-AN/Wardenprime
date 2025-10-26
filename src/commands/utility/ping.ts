import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder
} from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is working and get latency information')
    .setDMPermission(true) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Record the time when we start processing
      const startTime = Date.now();
      
      // Send initial response
      await interaction.deferReply();
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      
      // Get bot's WebSocket ping
      const wsPing = interaction.client.ws.ping;
      
      // Calculate round-trip time
      const roundTripTime = Date.now() - startTime;
      
      // Create ping embed
      const pingEmbed = createEmbed({
        type: 'info',
        title: '🏓 Pong!',
        description: 'Bot is working correctly!',
        fields: [
          {
            name: '📡 WebSocket Ping',
            value: `${wsPing}ms`,
            inline: true
          },
          {
            name: '⚡ Processing Time',
            value: `${processingTime}ms`,
            inline: true
          },
          {
            name: '🔄 Round Trip',
            value: `${roundTripTime}ms`,
            inline: true
          }
        ],
        footer: `Requested by ${interaction.user.tag}`,
        timestamp: true
      });
      
      // Add status indicators
      let status = '🟢 Excellent';
      if (wsPing > 200) status = '🟡 Good';
      if (wsPing > 500) status = '🟠 Fair';
      if (wsPing > 1000) status = '🔴 Poor';
      
      pingEmbed.addFields({
        name: '📊 Status',
        value: status,
        inline: true
      });
      
      // Add uptime information
      const uptime = process.uptime();
      const uptimeString = formatUptime(uptime);
      
      pingEmbed.addFields({
        name: '⏰ Uptime',
        value: uptimeString,
        inline: true
      });
      
      // Add memory usage
      const memUsage = process.memoryUsage();
      const memUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      pingEmbed.addFields({
        name: '💾 Memory',
        value: `${memUsed}MB / ${memTotal}MB`,
        inline: true
      });
      
      await interaction.editReply({ embeds: [pingEmbed] });
      
      logger.info(`Ping command used by ${interaction.user.tag} - WS: ${wsPing}ms, Processing: ${processingTime}ms`);
      
    } catch (error) {
      logger.error('Error in ping command:', error);
      
      const errorEmbed = createEmbed({
        type: 'error',
        title: '❌ Ping Failed',
        description: 'An error occurred while checking bot status.',
        timestamp: true
      });
      
      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (editError) {
        logger.error('Failed to send error response:', editError);
      }
    }
  }
};

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export = command;
