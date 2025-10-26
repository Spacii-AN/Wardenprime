import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';

// Server info command to display information about the current guild
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Displays information about the current server'),
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction) {
    // Make sure the command is used in a guild
    if (!interaction.guild) {
      const errorEmbed = createEmbed({
        type: 'error',
        title: 'Error',
        description: 'This command can only be used in a server.',
        timestamp: true
      });
      
      await interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Fetch guild information to ensure we have the latest data
    const guild = await interaction.guild.fetch();
    
    // Count bot and human members
    const members = await guild.members.fetch();
    const totalMembers = guild.memberCount;
    const botCount = members.filter(member => member.user.bot).size;
    const humanCount = totalMembers - botCount;
    
    // Count channels by type
    const channels = guild.channels.cache;
    const textChannels = channels.filter(channel => channel.type === ChannelType.GuildText).size;
    const voiceChannels = channels.filter(channel => channel.type === ChannelType.GuildVoice).size;
    const categoryChannels = channels.filter(channel => channel.type === ChannelType.GuildCategory).size;
    const threadChannels = channels.filter(channel => 
      channel.type === ChannelType.GuildNewsThread ||
      channel.type === ChannelType.GuildPublicThread ||
      channel.type === ChannelType.GuildPrivateThread
    ).size;
    
    // Count roles (excluding the @everyone role)
    const roleCount = guild.roles.cache.size - 1;
    
    // Calculate the server creation date
    const createdTimestamp = guild.createdTimestamp;
    const createdDate = new Date(createdTimestamp);
    const formattedDate = createdDate.toLocaleDateString();
    
    // Calculate the server age
    const now = Date.now();
    const ageMs = now - createdTimestamp;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    
    // Create the embed
    const serverEmbed = createEmbed({
      type: 'info',
      title: `${guild.name} Server Information`,
      description: guild.description || 'No description set.',
      thumbnail: guild.iconURL({ size: 256 }) || undefined,
      fields: [
        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '📅 Created On', value: `${formattedDate} (${ageDays} days ago)`, inline: true },
        { name: '👥 Members', value: `Total: ${totalMembers}\nHumans: ${humanCount}\nBots: ${botCount}`, inline: true },
        { name: '💬 Channels', value: `Text: ${textChannels}\nVoice: ${voiceChannels}\nCategories: ${categoryChannels}\nThreads: ${threadChannels}`, inline: true },
        { name: '🏷️ Roles', value: `${roleCount}`, inline: true }
      ],
      timestamp: true,
      footer: `Requested by ${interaction.user.tag}`
    });
    
    // Add boost status if any
    const premiumCount = guild.premiumSubscriptionCount ?? 0;
    if (premiumCount > 0) {
      serverEmbed.addFields({
        name: '🚀 Boost Status',
        value: `Level ${guild.premiumTier}\n${premiumCount} boosts`,
        inline: true
      });
    }
    
    await interaction.reply({ embeds: [serverEmbed] });
  }
};

export = command; 