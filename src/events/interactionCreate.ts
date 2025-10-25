import { Events, Interaction, Client, Collection } from 'discord.js';
import { Command, Event } from '../types/discord';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { createEmbed } from '../utils/embedBuilder';
import { handleCooldown } from '../utils/cooldown';
import { EmbedBuilder, TextChannel, ApplicationCommandOptionType } from 'discord.js';
import { pgdb } from '../services/postgresDatabase';
import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import { ThreadChannel } from 'discord.js';

// Store command cooldowns
const cooldowns = new Collection<string, Collection<string, number>>();

// Event fired when an interaction is created
export const name = Events.InteractionCreate;
export const once = false;

export const execute: Event<typeof Events.InteractionCreate>['execute'] = async (interaction: Interaction) => {
  try {
    // Log all interactions for easier diagnosis
    logger.event(`Interaction received: ${interaction.type} (${interaction.id}) from ${interaction.user?.tag || 'Unknown User'}`);

    // Ensure the user exists in the database
    if (pgdb && interaction.user) {
      await pgdb.ensureUserExists(interaction.user.id, interaction.user.tag);
    }
    
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const commandName = interaction.commandName;
      logger.debug(`Autocomplete requested for command: ${commandName}`);
      
      const command = interaction.client.commands.get(commandName);
      
      if (!command) {
        logger.warn(`Command ${commandName} not found for autocomplete`);
        await interaction.respond([]);
        return;
      }
      
      if (!command.autocomplete) {
        logger.warn(`Command ${commandName} does not have an autocomplete handler`);
        await interaction.respond([]);
        return;
      }
      
      try {
        logger.debug(`Executing autocomplete for: ${commandName}`);
        await command.autocomplete(interaction);
        logger.debug(`Completed autocomplete for: ${commandName}`);
      } catch (error) {
        logger.error(`Error in autocomplete for ${commandName}:`, error);
        // Respond with empty options to avoid "Loading options failed"
        try {
          await interaction.respond([]);
        } catch (responseError) {
          logger.error(`Failed to send empty autocomplete response:`, responseError);
        }
      }
      return;
    }

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;
      logger.command(`Command requested: ${commandName}`);
      
      // Get available commands if in debug mode
      if (process.env.LOG_LEVEL === 'DEBUG') {
        const availableCommands = Array.from(interaction.client.commands.keys()).join(', ');
        logger.debug(`Available commands: ${availableCommands}`);
      }
      
      const command = interaction.client.commands.get(commandName);
      
      if (!command) {
        logger.warn(`Command ${commandName} not found in command collection`);
        try {
          await interaction.reply({
            embeds: [createEmbed({
              type: 'error',
              title: 'Command Not Available',
              description: 'This command is not currently available.',
              timestamp: true
            })],
            ephemeral: true
          });
        } catch (replyError) {
          if ((replyError as Error).message.includes('Unknown interaction')) {
            logger.warn(`Interaction expired before we could reply: ${interaction.id}`);
          } else {
            logger.error(`Error replying to unknown command ${commandName}:`, replyError);
          }
        }
        return;
      }
      
      // Check for command cooldown
      const cooldownSeconds = command.cooldown || 0;
      if (cooldownSeconds > 0) {
        // If on cooldown, handleCooldown will respond to the user and return false
        if (!handleCooldown(interaction, cooldownSeconds)) {
          logger.command(`Command ${commandName} was on cooldown for user ${interaction.user.id}`);
          return;
        }
      }

      try {
        logger.command(`Executing: ${commandName} by ${interaction.user.tag} (${interaction.user.id})`);
        await command.execute(interaction);
        logger.command(`Completed: ${commandName}`);
        
        // Log moderator commands to the log channel if it exists
        try {
          // Check if the command is a moderation command (you can customize this list)
          const moderationCommands = ['ban', 'kick', 'unban', 'mute', 'unmute', 'warn', 'unwarn', 'clear', 'purge'];
          
          if (moderationCommands.includes(command.data.name) && interaction.guildId) {
            const guildSettings = await pgdb?.getGuildSettings(interaction.guildId);
            if (guildSettings?.log_channel_id) {
              // Check if mod commands logging is enabled
              const isModCommandsLoggingEnabled = await pgdb?.isLogTypeEnabled(interaction.guildId, 'mod_commands');
              if (!isModCommandsLoggingEnabled) {
                logger.debug(`Mod commands logging is disabled for guild ${interaction.guildId}`);
                return;
              }
              
              const logChannel = interaction.guild?.channels.cache.get(guildSettings.log_channel_id);
              if (logChannel?.isTextBased()) {
                // Create a log embed
                const logEmbed = new EmbedBuilder()
                  .setColor('#5865F2')
                  .setTitle('Moderator Command Used')
                  .setAuthor({
                    name: ' ',
                    iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
                  })
                  .setDescription(`A moderator command was used by ${interaction.user.tag}`)
                  .addFields(
                    { name: 'Command', value: `/${command.data.name}`, inline: true },
                    { name: 'User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true }
                  )
                  .setTimestamp();
                  
                // Add command options if available
                if (interaction.options) {
                  const options: string[] = [];
                  
                  // Try to extract command options (this is a simplified approach)
                  for (const option of interaction.options.data) {
                    let value = option.value;
                    
                    // If the option is a user, format it as a mention
                    if (option.type === ApplicationCommandOptionType.User && typeof option.value === 'string') {
                      value = `<@${option.value}>`;
                    }
                    
                    // If the option is a channel, format it as a mention
                    if (option.type === ApplicationCommandOptionType.Channel && typeof option.value === 'string') {
                      value = `<#${option.value}>`;
                    }
                    
                    options.push(`${option.name}: ${value}`);
                  }
                  
                  if (options.length > 0) {
                    logEmbed.addFields({ name: 'Options', value: options.join('\n') });
                  }
                }
                
                // Send the log embed
                await (logChannel as TextChannel).send({ embeds: [logEmbed] });
              }
            }
          }
        } catch (logError) {
          logger.error(`Error logging moderation command: ${logError}`);
        }
      } catch (error) {
        logger.error(`Error executing command ${commandName}:`, error);
        
        // Check for specific common errors
        const errorMessage = (error as Error).message || '';
        
        if (errorMessage.includes('Unknown interaction')) {
          logger.warn(`The interaction token expired during command ${commandName} execution.`);
          // Cannot reply to this interaction anymore - just log the event
          return;
        }
        
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'Command Error',
          description: 'There was an error executing this command.',
          timestamp: true
        });
        
        // Reply to user if the interaction hasn't been replied to yet
        try {
          if (interaction.replied) {
            await interaction.followUp({ 
              embeds: [errorEmbed],
              ephemeral: true
            });
          } else if (interaction.deferred) {
            await interaction.editReply({ 
              embeds: [errorEmbed]
            });
          } else {
            await interaction.reply({ 
              embeds: [errorEmbed],
              ephemeral: true 
            });
          }
        } catch (replyError) {
          if ((replyError as Error).message.includes('Unknown interaction') || 
              (replyError as Error).message.includes('already been acknowledged')) {
            logger.warn(`Couldn't reply with error for ${commandName}: Interaction expired or already acknowledged`);
          } else {
            logger.error(`Failed to send error message for ${commandName}:`, replyError);
          }
        }
      }
    } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      // Log other interaction types
      logger.event(`Received ${interaction.type} interaction`);
      
      // Handle button interactions
      if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Handle role reaction buttons
        if (customId.startsWith('role_')) {
          logger.event(`Role reaction button clicked: ${customId}`);
          try {
            // Import the handler dynamically to avoid circular dependencies
            const { handleRoleReactionButton } = require('../utils/roleReactions');
            await handleRoleReactionButton(interaction);
          } catch (error) {
            logger.error('Error handling role reaction button:', error);
            
            // Send an error message if we haven't replied yet
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                embeds: [createEmbed({
                  type: 'error',
                  title: 'Error',
                  description: 'An unexpected error occurred while processing your reaction.',
                  timestamp: true
                })],
                ephemeral: true
              });
            }
          }
        }
        
        // Handle giveaway entry buttons
        else if (customId.startsWith('giveaway_')) {
          logger.event(`Giveaway button clicked: ${customId}`);
          try {
            // Import the handler dynamically to avoid circular dependencies
            const { handleGiveawayEnterButton, handleGiveawayRerollButton } = require('../commands/utility/giveaway');
            
            if (customId.startsWith('giveaway_enter_')) {
              await handleGiveawayEnterButton(interaction);
            } else if (customId.startsWith('giveaway_reroll_')) {
              await handleGiveawayRerollButton(interaction);
            } else if (customId.startsWith('giveaway_delete_')) {
              // Handle delete confirmation buttons
              await handleGiveawayDeleteButton(interaction);
            }
          } catch (error) {
            logger.error('Error handling giveaway button:', error);
            
            // Send an error message if we haven't replied yet
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                embeds: [createEmbed({
                  type: 'error',
                  title: 'Error',
                  description: 'An unexpected error occurred while processing the giveaway action.',
                  timestamp: true
                })],
                ephemeral: true
              });
            }
          }
        }
        
        // Handle LFG buttons
        else if (customId.startsWith('lfg_')) {
          logger.event(`LFG button clicked: ${customId}`);
          try {
            if (customId.startsWith('lfg_full_')) {
              // Mark the LFG as full - simulate /full command
              await handleLfgFullButton(interaction as ButtonInteraction);
            } else if (customId.startsWith('lfg_close_')) {
              // Close the LFG - simulate /close command
              await handleLfgCloseButton(interaction as ButtonInteraction);
            }
          } catch (error) {
            logger.error('Error handling LFG button:', error);
            
            // Send an error message if we haven't replied yet
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                embeds: [createEmbed({
                  type: 'error',
                  title: 'Error',
                  description: 'An unexpected error occurred while processing the LFG action.',
                  timestamp: true
                })],
                ephemeral: true
              });
            }
          }
        }
      }
      
      // Handle string select menu for role reactions
      else if (interaction.isStringSelectMenu() && interaction.customId === 'role_select') {
        logger.event(`Role reaction select menu used: ${interaction.customId}`);
        try {
          // Import the handler dynamically to avoid circular dependencies
          const { handleRoleReactionSelect } = require('../utils/roleReactions');
          await handleRoleReactionSelect(interaction);
        } catch (error) {
          logger.error('Error handling role reaction select menu:', error);
          
          // Send an error message if we haven't replied yet
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              embeds: [createEmbed({
                type: 'error',
                title: 'Error',
                description: 'An unexpected error occurred while processing your role selection.',
                timestamp: true
              })],
              ephemeral: true
            });
          }
        }
      }
      // Handle modal submissions for giveaways
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('giveaway_create_modal_')) {
        logger.event(`Giveaway creation modal submitted by ${interaction.user.tag}`);
        try {
          // Import the handler dynamically to avoid circular dependencies
          const { handleGiveawayCreateModal } = require('../commands/utility/giveaway');
          await handleGiveawayCreateModal(interaction);
        } catch (error) {
          logger.error('Error handling giveaway creation modal:', error);
          
          // Send an error message if we haven't replied yet
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              embeds: [createEmbed({
                type: 'error',
                title: 'Error',
                description: 'An unexpected error occurred while creating your giveaway.',
                timestamp: true
              })],
              ephemeral: true
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error handling interaction: ${error}`);
  }
};

/**
 * Handles the "Mark as Full" button for LFG threads
 */
async function handleLfgFullButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Ensure this is in a thread
    if (!interaction.channel?.isThread()) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Invalid Channel',
          description: 'This command can only be used in LFG threads.',
          timestamp: true
        })]
      });
      return;
    }
    
    const thread = interaction.channel;
    
    // Verify the user is the thread owner or has permission
    const originalMessage = await interaction.channel.fetchStarterMessage();
    
    if (originalMessage.author.id !== interaction.user.id) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Permission Denied',
          description: 'Only the host can mark this LFG as full.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Get the current LFG session from database if available
    let currentPlayerCount = 1;
    let lfgSession = null;
    
    if (pgdb) {
      lfgSession = await pgdb.getLfgSession(thread.id);
      if (lfgSession) {
        currentPlayerCount = lfgSession.player_count;
        logger.info(`Current LFG session state: player_count=${currentPlayerCount}, status=${lfgSession.status}`);
      }
    }
    
    // Always set to max players (4) when marking as full
    const newPlayerCount = 4;
    
    // First priority: Update the embed to show full status
    try {
      const messages = await thread.messages.fetch({ limit: 10 });
      const botMessages = messages.filter(m => m.author.id === interaction.client.user?.id && m.embeds.length > 0);
      
      // We no longer need to update the player count in the embed
      logger.info(`LFG embed found but no player count update needed for FULL status`);
    } catch (embedError) {
      logger.error(`Error accessing messages: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
    }
    
    // Second priority: Send announcement message
    try {
      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ LFG MARKED AS FULL ⚠️')
            .setAuthor({
              name: ' ',
              iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
            })
            .setDescription(`This LFG session has been marked as **FULL** with **4/4** players by ${interaction.user}.`)
            .setTimestamp()
        ]
      });
      logger.info(`Sent FULL announcement message for button interaction`);
    } catch (messageError) {
      logger.error(`Failed to send FULL announcement: ${messageError instanceof Error ? messageError.message : String(messageError)}`);
    }
    
    // Third priority: Update the LFG session in the database
    if (pgdb && lfgSession) {
      try {
        const statusUpdateResult = await pgdb.updateLfgSessionStatus(lfgSession.id, 'FULL', newPlayerCount);
        logger.info(`Database status update to FULL result: ${statusUpdateResult}`);
      } catch (dbError) {
        logger.error(`Error updating database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
    }
    
    // Last priority: Update thread name if needed (only changing status, not player count)
    if (thread.name.includes('[OPEN]')) {
      try {
        // Extract mission name
        const currentName = thread.name;
        const missionNameMatch = currentName.match(/\[.*?](?:\s\[.*?])?\s-\s(.*)/);
        const missionName = missionNameMatch ? missionNameMatch[1] : "Unknown Mission";
        
        // Create new thread name without player count
        const newName = `[FULL] - ${missionName}`;
        
        await thread.setName(newName);
        logger.info(`Updated thread name to FULL status: ${newName}`);
      } catch (nameError) {
        logger.error(`Error updating thread name to FULL: ${nameError instanceof Error ? nameError.message : String(nameError)}`);
      }
    } else {
      logger.info(`Thread already marked as ${thread.name.includes('[FULL]') ? 'FULL' : 'CLOSED'}, skipping name update`);
    }
    
    // Delete the original message in the parent channel to avoid clutter, but with a delay
    try {
      // Get the parent channel and attempt to fetch the starter message
      const parentChannel = thread.parent;
      if (parentChannel && parentChannel.isTextBased()) {
        // Schedule deletion after 1.5 hours (90 minutes)
        const deleteDelayMs = 90 * 60 * 1000; // 1.5 hours in milliseconds
        
        // Log that we're scheduling the deletion
        logger.info(`Scheduling deletion of LFG message in parent channel in ${deleteDelayMs/60000} minutes`);
        
        // Store session for use in setTimeout
        const sessionForTimeout = lfgSession;
        
        // Set timeout to delete the message later
        setTimeout(async () => {
          try {
            // Try to delete the message that started this thread
            const starterMessage = await thread.fetchStarterMessage();
            if (starterMessage) {
              await starterMessage.delete();
              logger.info(`Deleted original LFG message ${starterMessage.id} in parent channel after delay`);
            }
            
            // After successful deletion, update the database status
            if (pgdb && sessionForTimeout) {
              await pgdb.updateLfgSessionStatus(sessionForTimeout.id, 'FULL');
              logger.info(`Confirmed LFG session ${sessionForTimeout.id} status as FULL after cleanup`);
            }
          } catch (delayedDeleteError) {
            // If error is "Unknown Message", the message was already deleted manually - that's fine
            const errorMessage = delayedDeleteError instanceof Error ? delayedDeleteError.message : String(delayedDeleteError);
            if (errorMessage.includes('Unknown Message')) {
              logger.info('Original LFG message was already deleted manually - skipping deletion');
            } else {
              logger.error(`Error during delayed deletion of LFG message: ${errorMessage}`);
            }
            
            // Even if deletion failed, ensure database is updated
            if (pgdb && sessionForTimeout) {
              try {
                await pgdb.updateLfgSessionStatus(sessionForTimeout.id, 'FULL');
                logger.info(`Confirmed LFG session ${sessionForTimeout.id} status as FULL despite deletion failure`);
              } catch (dbError) {
                logger.error(`Failed to update database after cleanup: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
              }
            }
          }
        }, deleteDelayMs);
      }
    } catch (deleteError) {
      // Just log the error but continue
      logger.error(`Error scheduling deletion of original LFG message: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    }
    
    // Send a confirmation message to the user
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'LFG Marked as Full',
        description: 'This LFG has been marked as full.',
        timestamp: true
      })]
    });
    
    logger.info(`LFG thread ${thread.id} marked as full by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error marking LFG as full: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Handles the "Close" button for LFG threads
 */
async function handleLfgCloseButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Ensure this is in a thread
    if (!interaction.channel?.isThread()) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Invalid Channel',
          description: 'This command can only be used in LFG threads.',
          timestamp: true
        })]
      });
      return;
    }
    
    const thread = interaction.channel;
    
    // Verify the user is the thread owner or has permission
    const originalMessage = await interaction.channel.fetchStarterMessage();
    
    if (originalMessage.author.id !== interaction.user.id) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Permission Denied',
          description: 'Only the host can close this LFG.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Update the thread name to show it's closed
    const currentName = thread.name;
    
    try {
      // Extract mission name
      const missionNameMatch = currentName.match(/\[.*?](?:\s\[.*?])?\s-\s(.*)/);
      const missionName = missionNameMatch ? missionNameMatch[1] : "Unknown Mission";
      
      // Create new thread name without player count
      const newName = `[CLOSED] - ${missionName}`;
      
      await thread.setName(newName);
      logger.info(`Updated thread name to CLOSED status: ${newName}`);
    } catch (nameError) {
      logger.error(`Error updating thread name to CLOSED: ${nameError instanceof Error ? nameError.message : String(nameError)}`);
    }
    
    // Get the LFG session from database if available
    let lfgSession = null;
    if (pgdb) {
      lfgSession = await pgdb.getLfgSession(thread.id);
      if (lfgSession) {
        await pgdb.updateLfgSessionStatus(lfgSession.id, 'CLOSED');
        logger.info(`Updated LFG session ${lfgSession.id} status to CLOSED in database`);
      }
    }
    
    // Delete the original message in the parent channel to avoid clutter, but with a delay
    try {
      // Get the parent channel and attempt to fetch the starter message
      const parentChannel = thread.parent;
      if (parentChannel && parentChannel.isTextBased()) {
        // Schedule deletion after 1.5 hours (90 minutes)
        const deleteDelayMs = 90 * 60 * 1000; // 1.5 hours in milliseconds
        
        // Log that we're scheduling the deletion
        logger.info(`Scheduling deletion of LFG message in parent channel in ${deleteDelayMs/60000} minutes`);
        
        // Store session for use in setTimeout
        const sessionForTimeout = lfgSession;
        
        // Set timeout to delete the message later
        setTimeout(async () => {
          try {
            // Try to delete the message that started this thread
            const starterMessage = await thread.fetchStarterMessage();
            if (starterMessage) {
              await starterMessage.delete();
              logger.info(`Deleted original LFG message ${starterMessage.id} in parent channel after delay`);
            }
            
            // After successful deletion, update the database status
            if (pgdb && sessionForTimeout) {
              await pgdb.updateLfgSessionStatus(sessionForTimeout.id, 'CLOSED');
              logger.info(`Confirmed LFG session ${sessionForTimeout.id} status as CLOSED after cleanup`);
            }
          } catch (delayedDeleteError) {
            // If error is "Unknown Message", the message was already deleted manually - that's fine
            const errorMessage = delayedDeleteError instanceof Error ? delayedDeleteError.message : String(delayedDeleteError);
            if (errorMessage.includes('Unknown Message')) {
              logger.info('Original LFG message was already deleted manually - skipping deletion');
            } else {
              logger.error(`Error during delayed deletion of LFG message: ${errorMessage}`);
            }
            
            // Even if deletion failed, ensure database is updated
            if (pgdb && sessionForTimeout) {
              try {
                await pgdb.updateLfgSessionStatus(sessionForTimeout.id, 'CLOSED');
                logger.info(`Confirmed LFG session ${sessionForTimeout.id} status as CLOSED despite deletion failure`);
              } catch (dbError) {
                logger.error(`Failed to update database after cleanup: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
              }
            }
          }
        }, deleteDelayMs);
      }
    } catch (deleteError) {
      // Just log the error but continue with thread closure
      logger.error(`Error scheduling deletion of original LFG message: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    }
    
    // Send a confirmation message
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'LFG Closed',
        description: 'This LFG has been closed. The thread will be archived in 1.5 hours.',
        timestamp: true
      })]
    });
    
    // Also send a message to the thread
    await thread.send({
      embeds: [createEmbed({
        type: 'info',
        title: 'LFG Closed',
        description: `${interaction.user} has closed this LFG. The thread will be archived in 1.5 hours.`,
        timestamp: true
      })]
    });
    
    // Schedule archiving the thread after 1.5 hours
    const archiveDelayMs = 90 * 60 * 1000; // 1.5 hours in milliseconds
    logger.info(`Scheduling thread archival in ${archiveDelayMs/60000} minutes`);
    
    setTimeout(async () => {
      try {
        // Get the thread again to ensure it still exists
        const threadToArchive = await interaction.client.channels.fetch(thread.id) as ThreadChannel;
        if (threadToArchive && !threadToArchive.archived) {
          await threadToArchive.setArchived(true, 'LFG auto-closure: 1.5 hour timer after being marked as closed');
          logger.info(`Thread ${thread.id} archived after 1.5 hour delay`);
        }
      } catch (archiveError) {
        logger.error(`Error during delayed thread archival: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`);
      }
    }, archiveDelayMs);
    
    logger.info(`LFG thread ${thread.id} closed by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error closing LFG: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Handles giveaway delete confirmation buttons
 */
async function handleGiveawayDeleteButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferUpdate();
    
    const customId = interaction.customId;
    
    if (customId === 'giveaway_delete_cancel') {
      // User cancelled deletion
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'info',
          title: 'Deletion Cancelled',
          description: 'The giveaway was not deleted.',
          timestamp: true
        })],
        components: []
      });
      return;
    }
    
    if (customId.startsWith('giveaway_delete_confirm_')) {
      // User confirmed deletion - this should be handled by the delete command's collector
      // This is just a fallback
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'info',
          title: 'Deletion Confirmed',
          description: 'The giveaway deletion has been processed.',
          timestamp: true
        })],
        components: []
      });
    }
  } catch (error) {
    logger.error(`Error handling giveaway delete button: ${error instanceof Error ? error.message : String(error)}`);
  }
} 