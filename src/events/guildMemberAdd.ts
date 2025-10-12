import { Events, GuildMember, EmbedBuilder, TextChannel, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';

// Event fired when a new member joins the server
export const name = Events.GuildMemberAdd;

export const execute: Event<typeof Events.GuildMemberAdd>['execute'] = async (member: GuildMember) => {
  try {
    logger.info(`New member joined: ${member.user.tag} (${member.id}) in guild ${member.guild.id}`);
    
    // Check if database is connected
    if (!pgdb) {
      logger.error(`Database connection not available for welcome message in guild ${member.guild.id}`);
      return;
    }
    
    // Get the guild settings
    const guildSettings = await pgdb.getGuildSettings(member.guild.id);
    
    // Check if join form is enabled
    const joinFormConfig = await pgdb.getJoinFormConfig(member.guild.id);
    if (joinFormConfig?.enabled) {
      await handleJoinFormWelcome(member, joinFormConfig);
      return; // Skip welcome message if join form is enabled
    }
    
    let welcomeChannel: TextChannel | null = null;
    
    // Try to get the channel from settings
    if (guildSettings?.welcome_channel_id) {
      const channel = member.guild.channels.cache.get(guildSettings.welcome_channel_id);
      if (channel?.isTextBased()) {
        welcomeChannel = channel as TextChannel;
        logger.info(`Found welcome channel from settings: ${welcomeChannel.name} (${welcomeChannel.id})`);
      }
    }
    
    // Fallback to finding by name if no channel was set or found
    if (!welcomeChannel) {
      logger.info(`No welcome channel configured in settings for guild ${member.guild.name}, trying to find by name`);
      
      welcomeChannel = member.guild.channels.cache.find(
        channel => channel.isTextBased() && channel.name.toLowerCase().includes('welcome')
      ) as TextChannel | null;
      
      if (welcomeChannel) {
        logger.info(`Found welcome channel by name: ${welcomeChannel.name} (${welcomeChannel.id})`);
      }
    }
    
    if (!welcomeChannel) {
      logger.warn(`Could not find a welcome channel in guild ${member.guild.id}`);
      return;
    }
    
    // Check permissions
    const permissions = welcomeChannel.permissionsFor(member.guild.members.me!);
    if (!permissions?.has('SendMessages') || !permissions.has('EmbedLinks')) {
      logger.warn(`Missing permissions to send welcome message in channel ${welcomeChannel.name}`);
      return;
    }
    
    // Create the welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#5865F2') // Discord blue color
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(`Hey ${member.toString()}! Welcome to ${member.guild.name}! Make sure to read the rules in the Rules page, change your nickname to that of yours in game, and check to see which roles you would like to add to yourself for certain notifications!`)
      .setImage('https://cdn.discordapp.com/attachments/1352558186166620184/1352690382206406698/Background.png?ex=67deee96&is=67dd9d16&hm=dee2d7914f4907e17146eb7c8a0158b89a890108b4d205934e69bfdbec2d4f1f&')
      .setAuthor({
        name: ' ', // Empty space to ensure the icon shows
        iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
      })
      .setTimestamp();
    
    logger.info(`Sending welcome message for ${member.user.tag} in channel ${welcomeChannel.name}`);
    
    // Send the welcome message - only send the embed, no separate content
    try {
      const sentMessage = await welcomeChannel.send({
        embeds: [welcomeEmbed]
      });
      
      logger.info(`Successfully sent welcome message to ${member.user.tag} in channel ${welcomeChannel.name} (${sentMessage.id})`);
    } catch (sendError) {
      logger.error(`Error sending welcome message: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
    }
  } catch (error) {
    logger.error(`Error in guildMemberAdd event: ${error instanceof Error ? error.message : String(error)}`);
  }
};

async function handleJoinFormWelcome(member: GuildMember, joinFormConfig: any) {
  try {
    // Send welcome message with join form button instructions
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(`Hello ${member.user.username}! Welcome to our Warframe community!`)
      .addFields(
        { name: '🔐 Server Access Required', value: 'To gain full access to our server, you need to complete a join form.', inline: false },
        { name: '📋 How to Join', value: `Look for the "${joinFormConfig.button_text || 'Complete Join Form'}" button in the server to get started!`, inline: false },
        { name: '⏱️ Processing Time', value: 'Your form will be reviewed by our staff within 24 hours.', inline: false }
      )
      .setFooter({ text: 'Click the join form button to access all server features' })
      .setTimestamp();

    // Try to send DM, but don't fail if DMs are disabled
    try {
      const dmChannel = await member.user.createDM();
      await dmChannel.send({
        content: `Welcome to ${member.guild.name}!`,
        embeds: [welcomeEmbed]
      });
    } catch (dmError) {
      logger.warn(`Could not send DM to ${member.user.tag}:`, dmError);
    }

    // Notify staff about new member requiring join form
    if (joinFormConfig.notification_channel_id) {
      const notificationChannel = member.guild.channels.cache.get(joinFormConfig.notification_channel_id);
      if (notificationChannel?.isTextBased()) {
        const notificationEmbed = new EmbedBuilder()
          .setTitle('🆕 New Member - Join Form Required')
          .setDescription(`A new member has joined and needs to complete the join form.`)
          .addFields(
            { name: 'User', value: `${member.user} (${member.user.tag})`, inline: true },
            { name: 'User ID', value: member.user.id, inline: true },
            { name: 'Joined', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setColor(0xFFA500)
          .setTimestamp();

        await (notificationChannel as TextChannel).send({ embeds: [notificationEmbed] });
      }
    }

    logger.info(`Join form welcome sent to new member ${member.user.tag} (${member.user.id})`);

  } catch (error) {
    logger.error(`Error sending join form welcome to ${member.user.tag}:`, error);
  }
} 