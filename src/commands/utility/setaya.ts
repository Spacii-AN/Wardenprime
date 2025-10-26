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
import { fetchAyaBountyData } from '../../services/ayaService';

// Interface for the Aya service
interface AyaBountyData {
  ayaTents: Record<string, Array<string>>;
  expiryTimestamp: number;
}

// Function to start the aya service
const startAyaService = (client: any): void => {
  logger.info('Starting Aya service...');
};

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setaya')
    .setDescription('Set a channel to receive automatic Aya bounty notifications')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('The channel to send Aya bounty updates to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('Role to ping when Aya bounties are found')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const channel = interaction.options.getChannel('channel', true);
      const pingRole = interaction.options.getRole('ping_role');
      const guildId = interaction.guildId;
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Get existing notifications for this guild
      const existingConfigs = await pgdb.getAyaNotifications();
      const existingConfig = existingConfigs.find(config => config.guild_id === guildId);
      
      let notificationId;
      
      if (existingConfig) {
        // Update the existing notification in PostgreSQL
        await pgdb.query(
          'UPDATE aya_notifications SET channel_id = $1, role_id = $2, updated_at = NOW() WHERE guild_id = $3 RETURNING id',
          [channel.id, pingRole?.id || null, guildId]
        );
        notificationId = existingConfig.id;
        logger.info(`Updated Aya notifications channel for guild ${guildId} to ${channel.id}`);
      } else {
        // Add a new notification to PostgreSQL
        const result = await pgdb.addAyaNotification(guildId, channel.id, pingRole?.id || null);
        notificationId = result.id;
        logger.info(`Set Aya notifications channel for guild ${guildId} to ${channel.id}`);
      }
      
      // Send initial Aya bounty message
      try {
        // Fetch current Aya bounty data
        const { ayaTents, expiryTimestamp } = await fetchAyaBountyData();
        
        // Create initial embed
        const ayaEmbed = createEmbed({
          type: 'info',
          title: 'Warframe Bounties',
          description: `Current Bounties\nReset <t:${Math.floor(expiryTimestamp)}:R>`,
          fields: [
            {
              name: 'Konzu Bounties:',
              value: '🔴 No good bounties available.',
              inline: false
            },
            {
              name: 'Tent A Bounties:',
              value: ayaTents.TentA && ayaTents.TentA.length > 0 ? 
                `🟢 Found Aya bounties:\n• ${ayaTents.TentA.join('\n• ')}` : 
                '🔴 No good bounties available.',
              inline: false
            },
            {
              name: 'Tent B Bounties:',
              value: ayaTents.TentB && ayaTents.TentB.length > 0 ? 
                `🟢 Found Aya bounties:\n• ${ayaTents.TentB.join('\n• ')}` : 
                '🔴 No good bounties available.',
              inline: false
            },
            {
              name: 'Tent C Bounties:',
              value: ayaTents.TentC && ayaTents.TentC.length > 0 ? 
                `🟢 Found Aya bounties:\n• ${ayaTents.TentC.join('\n• ')}` : 
                '🔴 No good bounties available.',
              inline: false
            }
          ],
          thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Currency/Aya.png',
          timestamp: true
        });
        
        // Check if we need to add a role ping
        let content = null;
        const anyAyaTentsFound = Object.values(ayaTents).some(tents => 
          Array.isArray(tents) && tents.length > 0
        );
        const twoOrMoreTentsFound = Object.values(ayaTents).filter(tents => 
          Array.isArray(tents) && tents.length > 0
        ).length >= 2;
        
        if (pingRole && twoOrMoreTentsFound) {
          content = `<@&${pingRole.id}> Multiple Aya bounties found!`;
        }
        
        // Send the message to the channel
        const sentMessage = await (channel as TextChannel).send({ 
          content,
          embeds: [ayaEmbed] 
        });
        
        // Update the database with the message ID for future updates
        await pgdb.updateAyaMessageId(notificationId, sentMessage.id);
        
        logger.info(`Sent initial Aya bounty message to channel ${channel.name} (${channel.id}) with message ID ${sentMessage.id}`);
        
        // Make sure the Aya service is running
        startAyaService(interaction.client);
        
      } catch (error) {
        logger.error('Error sending initial Aya bounty message:', error);
        // Don't fail the command if we can't send the initial message
      }
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Aya Bounty Notifications Set',
        description: `Warframe Aya bounty updates will now be automatically posted in ${channel}.`,
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
      logger.error('Error in setaya command:', error);
      await interaction.editReply('An error occurred while setting up Aya bounty notifications. Please try again later.');
    }
  }
};

// Export the command in the format expected by the command loader
export = command; 