import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChatInputCommandInteraction, 
  ChannelType,
  TextChannel
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set the welcome channel for new member messages')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel where welcome messages will be sent')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as unknown as SlashCommandBuilder,
    
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Get the selected channel
      const channelOption = interaction.options.getChannel('channel', true);
      
      // Ensure it's a text channel
      if (channelOption.type !== ChannelType.GuildText) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Invalid Channel',
            description: 'Please select a text channel where messages can be sent.',
            timestamp: true
          })]
        });
        return;
      }
      
      const channel = channelOption as TextChannel;
      
      // Check bot permissions in the channel
      const permissions = channel.permissionsFor(interaction.guild!.members.me!);
      if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Missing Permissions',
            description: `I don't have permission to send messages or embed links in ${channel}.`,
            timestamp: true
          })]
        });
        return;
      }
      
      // Update the welcome channel in the database
      if (!pgdb) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Database Error',
            description: 'Database connection is not available.',
            timestamp: true
          })]
        });
        return;
      }
      
      await pgdb.updateGuildSetting(interaction.guildId!, 'welcome_channel_id', channel.id);
      
      // Confirm the update
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'Welcome Channel Set',
          description: `Welcome messages will now be sent to ${channel}.\n\nNew members will receive a welcome message with your server's rules and information.`,
          timestamp: true
        })]
      });
      
      logger.info(`Welcome channel set to ${channel.name} (${channel.id}) in guild ${interaction.guildId} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error setting welcome channel: ${error instanceof Error ? error.message : String(error)}`);
      
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred while setting the welcome channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  }
};

module.exports = command; 