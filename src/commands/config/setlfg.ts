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

// Define command as a variable first, then export it
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setlfg')
    .setDescription('Set a channel for Looking For Group (LFG) functionality')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel where LFG posts will be monitored')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) as SlashCommandBuilder,
    
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
            description: 'Please select a text channel for LFG functionality.',
            timestamp: true
          })]
        });
        return;
      }
      
      const channel = channelOption as TextChannel;
      
      // Check bot permissions in the channel
      const permissions = channel.permissionsFor(interaction.guild!.members.me!);
      if (!permissions?.has(PermissionFlagsBits.SendMessages) || 
          !permissions.has(PermissionFlagsBits.EmbedLinks) || 
          !permissions.has(PermissionFlagsBits.CreatePublicThreads)) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Missing Permissions',
            description: `I don't have the required permissions in ${channel}. I need: Send Messages, Embed Links, and Create Public Threads.`,
            timestamp: true
          })]
        });
        return;
      }
      
      // Update the LFG channel in the database
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
      
      // We'll need to create a field in guild_settings for this
      // First, ensure the guild_settings record exists and update it
      await pgdb.updateGuildSetting(interaction.guildId!, 'lfg_channel_id', channel.id);
      
      // Send success message
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'LFG Channel Set',
          description: `LFG functionality has been activated in ${channel}.\n\nUsers can now post in this channel to create LFG threads automatically.\n\nHost commands available in threads:\n• \`/close\` - Close the LFG thread\n• \`/full\` - Mark the squad as full`,
          timestamp: true
        })]
      });
      
      // Send an instructional message to the channel
      await channel.send({
        embeds: [createEmbed({
          type: 'info',
          title: 'LFG Channel Activated',
          description: 'This channel has been set up for Looking For Group (LFG) functionality.\n\n**How it works:**\n• Post a message in this channel to create an LFG request\n• A thread will be created for your request\n• Others can join your group by posting in the thread\n• Use `/close` to close your LFG when done\n• Use `/full` to mark your squad as full',
          timestamp: true
        })]
      });
      
      logger.info(`LFG channel set to ${channel.name} (${channel.id}) in guild ${interaction.guildId} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error setting LFG channel: ${error}`);
      
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  }
};

// Export the command properly
export const { data, execute } = command;
export default command; 