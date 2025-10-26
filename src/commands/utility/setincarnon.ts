import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';
import { startIncarnationService } from '../../services/incarnonService';
import { Command } from '../../types/discord';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setincarnon')
    .setDescription('Setup automatic Incarnon Genesis rotation/weapon notifications in a channel.')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('Channel to send Incarnon Genesis notifications to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to ping when new Incarnon Genesis rotations are available (optional)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      
      if (!channel) {
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: 'Error',
              description: 'You must specify a valid text channel.',
              color: 'Red'
            })
          ]
        });
        return;
      }
      
      // Check if a configuration already exists for this guild
      const existingConfig = await pgdb.getIncarnonNotificationByGuild(interaction.guildId);
      
      if (existingConfig) {
        // Update existing configuration
        await pgdb.updateIncarnonNotification(
          interaction.guildId,
          channel.id,
          role?.id || null
        );
        
        logger.info(`Updated Incarnon notifications for guild ${interaction.guildId} to channel ${channel.id} ${role ? `with role ${role.id}` : 'without a role'}`);
      } else {
        // Create new configuration
        await pgdb.addIncarnonNotification(
          interaction.guildId,
          channel.id,
          role?.id || null
        );
        
        logger.info(`Added Incarnon notifications for guild ${interaction.guildId} to channel ${channel.id} ${role ? `with role ${role.id}` : 'without a role'}`);
      }
      
      // Attempt to send the initial message
      try {
        // Start or restart the Incarnon service
        startIncarnationService(interaction.client);
        
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: 'Incarnon Genesis Notifications Configured',
              description: `Incarnon Genesis rotation notifications will be sent to ${channel} ${role ? `and ping ${role}` : ''}.`,
              color: 'Green',
              footer: 'The current Incarnon Genesis rotation will be shown shortly.'
            })
          ]
        });
      } catch (error) {
        logger.error(`Error sending initial Incarnon message: ${error}`);
        
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: 'Incarnon Genesis Notifications Configured',
              description: `Incarnon Genesis rotation notifications will be sent to ${channel} ${role ? `and ping ${role}` : ''}, but there was an error sending the initial status message.`,
              color: 'Yellow'
            })
          ]
        });
      }
    } catch (error) {
      logger.error(`Error configuring Incarnon notifications: ${error}`);
      
      await interaction.editReply({
        embeds: [
          createEmbed({
            title: 'Error',
            description: 'There was an error setting up Incarnon Genesis notifications. Please try again later.',
            color: 'Red'
          })
        ]
      });
    }
  }
};

export = command; 