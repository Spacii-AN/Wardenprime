import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  Role
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';
import { startBaroService, triggerBaroUpdate } from '../../services/baroService';

// Interface for the Baro Channel Configuration
interface BaroNotification {
  id: string;
  guild_id: string;
  channel_id: string;
  role_id: string | null;
  message_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setbaro')
    .setDescription('Set up automatic Baro Ki\'Teer schedule and inventory updates in a channel')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel where Baro updates will be posted')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option => 
      option
        .setName('ping_role')
        .setDescription('Role to ping when Baro arrives with new inventory')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const pingRole = interaction.options.getRole('ping_role');
      const guildId = interaction.guildId;
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Get existing notifications for this guild
      const existingConfigs = await pgdb.getBaroNotifications();
      const existingConfig = existingConfigs.find(config => config.guild_id === guildId);
      
      let notificationId;
      
      if (existingConfig) {
        // Update the existing notification in PostgreSQL
        await pgdb.query(
          'UPDATE baro_notifications SET channel_id = $1, role_id = $2, updated_at = NOW() WHERE guild_id = $3 RETURNING id',
          [channel.id, pingRole?.id || null, guildId]
        );
        notificationId = existingConfig.id;
        logger.info(`Updated Baro Ki'Teer notification channel for guild ${guildId} to ${channel.id}`);
      } else {
        // Add a new notification to PostgreSQL
        const result = await pgdb.addBaroNotification(guildId, channel.id, pingRole?.id || null);
        notificationId = result.id;
        logger.info(`Set Baro Ki'Teer notification channel for guild ${guildId} to ${channel.id}`);
      }
      
      // Try to send an initial message with current Baro status
      try {
        // Send initial message and get its ID
        const sentMessage = await triggerBaroUpdate(interaction.client, guildId);
        
        if (sentMessage) {
          // Update the database with the message ID for future updates
          await pgdb.updateBaroMessageId(notificationId, sentMessage.id);
          
          logger.info(`Sent initial Baro Ki'Teer message to channel ${channel.name} (${channel.id}) with message ID ${sentMessage.id}`);
        }
        
        // Make sure the Baro service is running
        startBaroService(interaction.client);
        
      } catch (error) {
        logger.error('Error sending initial Baro Ki\'Teer message:', error);
        // Don't fail the command if we can't send the initial message
      }
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Baro Ki\'Teer Notifications Set',
        description: `Baro Ki'Teer schedule and inventory updates will now be automatically posted in ${channel}.`,
        fields: [
          {
            name: 'Channel',
            value: `<#${channel.id}>`,
            inline: true
          },
          {
            name: 'Role Ping',
            value: pingRole ? `<@&${pingRole.id}>` : 'No role ping configured',
            inline: true
          }
        ],
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
    } catch (error) {
      logger.error('Error in setbaro command:', error);
      await interaction.editReply('An error occurred while setting up Baro Ki\'Teer notifications. Please try again later.');
    }
  }
};

export = command; 