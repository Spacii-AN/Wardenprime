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
    .setName('setthreadjoin')
    .setDescription('Configure which channels the bot will automatically join threads in')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('How to filter channels for auto-joining threads')
        .setRequired(true)
        .addChoices(
          { name: 'All Channels (default)', value: 'all' },
          { name: 'Whitelist Only', value: 'whitelist' },
          { name: 'Blacklist Excluded', value: 'blacklist' }
        )
    )
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('Channel to add/remove from the list (optional)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('What to do with the channel (when channel is specified)')
        .addChoices(
          { name: 'Add to list', value: 'add' },
          { name: 'Remove from list', value: 'remove' },
          { name: 'Show current list', value: 'list' }
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) as SlashCommandBuilder,
    
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const mode = interaction.options.getString('mode', true) as 'all' | 'whitelist' | 'blacklist';
      const channelOption = interaction.options.getChannel('channel', false);
      const action = interaction.options.getString('action', false);
      
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
      
      // Set the mode first
      await pgdb.setThreadAutoJoinMode(interaction.guildId!, mode);
      
      let responseMessage = '';
      let currentChannels: string[] = [];
      
      // Handle channel-specific actions
      if (channelOption && action) {
        const channel = channelOption as TextChannel;
        
        if (action === 'add') {
          await pgdb.addThreadChannel(interaction.guildId!, channel.id);
          responseMessage += `✅ Added ${channel} to the ${mode} list.\n`;
        } else if (action === 'remove') {
          await pgdb.removeThreadChannel(interaction.guildId!, channel.id);
          responseMessage += `❌ Removed ${channel} from the ${mode} list.\n`;
        }
      }
      
      // Get current channels for display
      if (mode !== 'all') {
        currentChannels = await pgdb.getThreadChannels(interaction.guildId!);
      }
      
      // Build the response
      let modeDescription = '';
      let channelListText = '';
      
      switch (mode) {
        case 'all':
          modeDescription = 'The bot will automatically join threads in **all channels**.';
          break;
        case 'whitelist':
          modeDescription = 'The bot will **only** join threads in the channels listed below.';
          channelListText = currentChannels.length > 0 
            ? `\n**Whitelisted Channels:**\n${currentChannels.map(id => `<#${id}>`).join('\n')}`
            : '\n**No channels whitelisted yet.** Use `/setthreadjoin` with a channel to add them.';
          break;
        case 'blacklist':
          modeDescription = 'The bot will join threads in **all channels except** those listed below.';
          channelListText = currentChannels.length > 0 
            ? `\n**Blacklisted Channels:**\n${currentChannels.map(id => `<#${id}>`).join('\n')}`
            : '\n**No channels blacklisted.**';
          break;
      }
      
      const embed = createEmbed({
        type: 'success',
        title: 'Thread Auto-Join Settings Updated',
        description: `${responseMessage}\n**Mode:** ${mode}\n\n${modeDescription}${channelListText}`,
        timestamp: true
      });
      
      // Add usage instructions
      embed.addFields({
        name: 'Usage',
        value: `• \`/setthreadjoin mode:whitelist channel:#general action:add\` - Add a channel to whitelist\n• \`/setthreadjoin mode:blacklist channel:#spam action:add\` - Add a channel to blacklist\n• \`/setthreadjoin mode:all\` - Allow auto-join in all channels`,
        inline: false
      });
      
      await interaction.editReply({ embeds: [embed] });
      
      logger.info(`Thread auto-join mode set to ${mode} for guild ${interaction.guildId} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error setting thread auto-join: ${error}`);
      
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
