import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChatInputCommandInteraction, 
  ChannelType,
  TextChannel,
  GuildMember,
  Role
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

const RESTRICTED_ROLE_NAME = 'Unverified';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set the welcome channel for new member messages')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send welcome messages to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ) as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel('channel') as TextChannel;
    if (!channel) {
      await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
      return;
    }

    try {
      // Only try to use these methods if they exist
      if (typeof pgdb.setWelcomeChannel !== 'function') {
        logger.error('Database method not implemented: setWelcomeChannel');
        await interaction.reply({ 
          content: 'This feature is not available because the database is not properly configured.', 
          ephemeral: true 
        });
        return;
      }
      
      await pgdb.setWelcomeChannel(interaction.guild.id, channel.id);
      await interaction.reply({ content: `Welcome channel set to ${channel}.`, ephemeral: true });
    } catch (error) {
      logger.error('Error setting welcome channel:', error);
      await interaction.reply({ content: 'Failed to set the welcome channel.', ephemeral: true });
    }
  }
};

// Export the command in the format expected by the command loader
module.exports = command;

// Event listener for new members
export async function onGuildMemberAdd(member: GuildMember) {
  try {
    const guild = member.guild;
    
    // Check if the method exists before calling it
    if (typeof pgdb.getWelcomeChannel !== 'function') {
      logger.warn('Database method not implemented: getWelcomeChannel');
      return;
    }
    
    const channelId = await pgdb.getWelcomeChannel(guild.id);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId) as TextChannel;
    if (!channel) return;

    // Assign restricted role
    let restrictedRole = guild.roles.cache.find(role => role.name === RESTRICTED_ROLE_NAME);
    if (!restrictedRole) {
      restrictedRole = await guild.roles.create({ name: RESTRICTED_ROLE_NAME, permissions: [] });
    }
    await member.roles.add(restrictedRole);

    // Ask the new member for their in-game name and preferred nickname
    const dmChannel = await member.createDM();
    await dmChannel.send('Welcome! Please reply with your in-game name and preferred nickname in this format: `IGN:YourName, Nickname:YourNick`. You will not gain full access until you provide this information.');
    
    const filter = (response: any) => response.author.id === member.id;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
    if (!collected.size) {
      await dmChannel.send('You did not provide the required information. You remain restricted until you do.');
      return;
    }
    
    const message = collected.first()?.content;
    const match = message?.match(/IGN:(.*?),\s*Nickname:(.*)/);
    if (!match) {
      await dmChannel.send('Invalid format. Please try again using: `IGN:YourName, Nickname:YourNick`.');
      return;
    }
    
    const inGameName = match[1].trim();
    const preferredNickname = match[2].trim();
    
    const newNickname = `${preferredNickname} (${inGameName})`;
    await member.setNickname(newNickname).catch(console.error);
    await member.roles.remove(restrictedRole); // Remove restricted role
    
    await channel.send(`Welcome <@${member.id}> to the server! 🎉 Your nickname has been updated to **${newNickname}**.`);
  } catch (error) {
    console.error('Error handling new member:', error);
  }
}