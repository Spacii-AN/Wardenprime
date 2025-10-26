import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChatInputCommandInteraction, 
  ChannelType,
  TextChannel,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb, LogSettings } from '../../services/postgresDatabase';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

// Map friendly names to database fields
const logTypeMap: Record<string, keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>> = {
  'Moderator Commands': 'mod_commands',
  'Voice Channel Joins': 'voice_join',
  'Voice Channel Leaves': 'voice_leave',
  'Message Deletions': 'message_delete',
  'Message Edits': 'message_edit',
  'Member Joins': 'member_join',
  'Member Leaves': 'member_leave',
  'Bans': 'ban_add',
  'Unbans': 'ban_remove',
  'Kicks': 'kick',
  'Mutes': 'mute_add',
  'Unmutes': 'mute_remove',
  'Warnings': 'warn_add',
  'Warning Removals': 'warn_remove',
  'Role Changes': 'role_changes'
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('Set the channel for server logs and configure which events to log')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel where logs will be sent')
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
            description: 'Please select a text channel where logs can be sent.',
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
      
      // Update the log channel in the database
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
      
      // First, ensure the guild exists in the guilds table with a name and owner_id
      await pgdb.query(
        `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [interaction.guildId, `Server ${interaction.guildId}`, '0']  // Use '0' as a placeholder owner_id
      );
      
      // Then ensure the guild_settings record exists and update it
      await pgdb.updateGuildSetting(interaction.guildId!, 'log_channel_id', channel.id);
      
      // Get current log settings
      const logSettings = await pgdb.getLogSettings(interaction.guildId!);
      
      // Create a string select menu for log settings
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('log_settings_select')
        .setPlaceholder('Toggle log events (all enabled by default)')
        .setMinValues(0)
        .setMaxValues(Object.keys(logTypeMap).length);
      
      // Add options for each log type
      for (const [displayName, dbField] of Object.entries(logTypeMap)) {
        const isEnabled = logSettings ? logSettings[dbField] : true;
        
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(displayName)
            .setValue(dbField)
            .setDescription(`${isEnabled ? 'Enabled' : 'Disabled'} - Click to toggle`)
            .setDefault(isEnabled)
        );
      }
      
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      
      const saveButton = new ButtonBuilder()
        .setCustomId('save_log_settings')
        .setLabel('Confirm Settings')
        .setStyle(ButtonStyle.Primary);
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(saveButton);
      
      // Respond with success and the select menu
      const response = await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'Logging Channel Set',
          description: `Server logs will now be sent to ${channel}.\n\nUse the menu below to select which events to log. Selected items will be logged, unselected items will be ignored.\n\nClick "Confirm Settings" when you're done to activate logging.`,
          timestamp: true
        })],
        components: [row, buttonRow]
      });
      
      logger.info(`Logging channel set to ${channel.name} (${channel.id}) in guild ${interaction.guildId} by ${interaction.user.tag}`);
      
      // Handle interaction with the select menu and save button
      const collector = response.createMessageComponentCollector({ 
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
      });
      
      // Store current selections
      const selectedOptions = Object.keys(logTypeMap).filter(key => 
        logSettings ? logSettings[logTypeMap[key]] : true
      ).map(key => logTypeMap[key]);
      
      collector.on('collect', async i => {
        // Handle select menu
        if (i.componentType === ComponentType.StringSelect) {
          await i.deferUpdate();
          
          // Update selected options
          if (i.customId === 'log_settings_select') {
            // Clear the array and add the newly selected values
            selectedOptions.length = 0;
            
            // Ensure values are of the correct type
            i.values.forEach(value => {
              if (Object.values(logTypeMap).includes(value as any)) {
                selectedOptions.push(value as keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>);
              }
            });
          }
        }
        // Handle save button
        else if (i.componentType === ComponentType.Button && i.customId === 'save_log_settings') {
          await i.deferUpdate();
          
          // Create a settings object to update all at once
          const settingsToUpdate: Partial<Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>> = {};
          
          // Set all fields to false initially
          for (const dbField of Object.values(logTypeMap)) {
            settingsToUpdate[dbField] = false;
          }
          
          // Then set selected options to true
          for (const selected of selectedOptions) {
            settingsToUpdate[selected as keyof typeof settingsToUpdate] = true;
          }
          
          // Update the database
          const success = await pgdb.query(
            `UPDATE log_settings 
             SET mod_commands = $1, 
                 voice_join = $2, 
                 voice_leave = $3, 
                 message_delete = $4, 
                 message_edit = $5, 
                 member_join = $6, 
                 member_leave = $7, 
                 ban_add = $8, 
                 ban_remove = $9, 
                 kick = $10, 
                 mute_add = $11, 
                 mute_remove = $12, 
                 warn_add = $13, 
                 warn_remove = $14, 
                 role_changes = $15,
                 updated_at = NOW()
             WHERE guild_id = $16`,
            [
              settingsToUpdate.mod_commands,
              settingsToUpdate.voice_join,
              settingsToUpdate.voice_leave,
              settingsToUpdate.message_delete,
              settingsToUpdate.message_edit,
              settingsToUpdate.member_join,
              settingsToUpdate.member_leave,
              settingsToUpdate.ban_add,
              settingsToUpdate.ban_remove,
              settingsToUpdate.kick,
              settingsToUpdate.mute_add,
              settingsToUpdate.mute_remove,
              settingsToUpdate.warn_add,
              settingsToUpdate.warn_remove,
              settingsToUpdate.role_changes,
              interaction.guildId
            ]
          );
          
          // Create a list of enabled log types for display
          const enabledTypes = Object.entries(logTypeMap)
            .filter(([_, dbField]) => settingsToUpdate[dbField])
            .map(([displayName, _]) => displayName);
          
          // Create success message
          const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('Log Settings Saved')
            .setDescription(`Your log settings have been updated. The following events will be logged in ${channel}:`)
            .addFields({
              name: 'Enabled Logs',
              value: enabledTypes.length > 0 
                ? enabledTypes.map(type => `• ${type}`).join('\n')
                : 'No log types enabled'
            })
            .setAuthor({
              name: ' ',
              iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
            })
            .setTimestamp();
            
          // Send the confirmation message to the log channel
          await channel.send({
            embeds: [createEmbed({
              type: 'info',
              title: 'Logging Enabled',
              description: 'This channel has been set as the server logging channel. Server events will be logged here based on your configuration.',
              footer: 'Logging system initialized',
              timestamp: true
            })]
          });
          
          // Stop the collector
          collector.stop();
          
          // Reply with success
          await interaction.editReply({
            embeds: [embed],
            components: []
          });
          
          logger.info(`Log settings updated for guild ${interaction.guildId} by ${interaction.user.tag}`);
        }
      });
      
      collector.on('end', async (_, reason) => {
        if (reason === 'time') {
          await interaction.editReply({
            components: [],
            embeds: [createEmbed({
              type: 'info',
              title: 'Log Settings',
              description: 'The configuration time has expired. You can run the command again to make changes.',
              timestamp: true
            })]
          });
        }
      });
    } catch (error) {
      logger.error(`Error setting log channel: ${error instanceof Error ? error.message : String(error)}`);
      
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred while setting the log channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  }
};

module.exports = command;