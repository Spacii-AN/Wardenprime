import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  ButtonInteraction,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { RoleReactionButton } from '../services/postgresDatabase';
import { logger } from './logger';
import { createEmbed } from './embedBuilder';
import { pgdb } from '../services/postgresDatabase';

/**
 * Creates action rows with buttons for role reactions
 * @param buttons Array of role reaction buttons from the database
 * @returns Array of action rows with buttons
 */
export function createRoleReactionButtons(buttons?: RoleReactionButton[]) {
  logger.debug('Creating role reaction buttons from:', buttons);
  
  if (!buttons || buttons.length === 0) {
    return [];
  }

  // Group buttons by position (max 5 per row)
  const rows: ButtonBuilder[][] = [];
  let currentRow: ButtonBuilder[] = [];
  let currentRowIndex = 0;

  // Sort buttons by position
  const sortedButtons = [...buttons].sort((a, b) => a.position - b.position);

  for (const button of sortedButtons) {
    // If we've filled a row, create a new one
    if (currentRow.length >= 5) {
      rows.push(currentRow);
      currentRow = [];
      currentRowIndex++;
    }

    // Determine button style
    let style: ButtonStyle;
    switch (button.style.toLowerCase()) {
      case 'primary':
        style = ButtonStyle.Primary;
        break;
      case 'secondary':
        style = ButtonStyle.Secondary;
        break;
      case 'success':
        style = ButtonStyle.Success;
        break;
      case 'danger':
        style = ButtonStyle.Danger;
        break;
      default:
        style = ButtonStyle.Primary;
    }

    // Create the button
    const buttonBuilder = new ButtonBuilder()
      .setCustomId(`role_${button.role_reaction_id}_${button.role_id}`)
      .setLabel(button.label)
      .setStyle(style);

    // Add emoji if present
    if (button.emoji) {
      // Check if this is a custom emoji in Discord format
      const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/;
      const customEmojiMatch = button.emoji.match(emojiRegex);
      
      if (customEmojiMatch) {
        // This is a custom emoji in Discord format: <:name:id> or <a:name:id>
        const isAnimated = button.emoji.startsWith('<a:');
        const name = customEmojiMatch[1];
        const id = customEmojiMatch[2];
        
        logger.debug(`Processing custom emoji for button: name=${name}, id=${id}, animated=${isAnimated}`);
        
        buttonBuilder.setEmoji({
          name,
          id,
          animated: isAnimated
        });
      } else {
        // This is a unicode emoji
        buttonBuilder.setEmoji(button.emoji);
      }
    }

    currentRow.push(buttonBuilder);
  }

  // Add the last row if not empty
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Convert to ActionRowBuilder objects
  return rows.map(row => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...row);
  });
}

/**
 * Handles button interactions for role reactions
 * @param interaction The button interaction
 */
export async function handleRoleReactionButton(interaction: ButtonInteraction) {
  try {
    logger.debug(`Handling role reaction button: ${interaction.customId}`);
    
    // Ensure pgdb exists
    if (!pgdb) {
      logger.error('Role reaction button: PostgreSQL database not available');
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Database Error',
          description: 'Database connection is not available',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    // Parse the custom ID (format: role_roleReactionId_roleId)
    const parts = interaction.customId.split('_');
    if (parts.length !== 3) {
      logger.error(`Invalid role reaction button ID: ${interaction.customId}`);
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Invalid button. Please contact a server administrator.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }

    const roleReactionId = parts[1];
    const roleId = parts[2];
    
    logger.debug(`Role reaction button: roleReactionId=${roleReactionId}, roleId=${roleId}`);

    // Get the role from the guild
    const role = await interaction.guild?.roles.fetch(roleId);
    if (!role) {
      logger.error(`Role not found: ${roleId}`);
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Role Not Found',
          description: 'The role associated with this button no longer exists.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }

    // Get the member
    const member = interaction.member as GuildMember;
    if (!member) {
      logger.error(`Member not found: ${interaction.user.id}`);
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Could not retrieve your member information.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }

    // Toggle the role
    try {
      if (member.roles.cache.has(roleId)) {
        // Remove the role
        await member.roles.remove(role);
        logger.info(`Removed role ${role.name} (${roleId}) from ${member.user.tag} (${member.id})`);
        
        await interaction.reply({
          embeds: [createEmbed({
            type: 'success',
            title: 'Role Removed',
            description: `The **${role.name}** role has been removed.`,
            timestamp: true
          })],
          ephemeral: true
        });
      } else {
        // Add the role
        await member.roles.add(role);
        logger.info(`Added role ${role.name} (${roleId}) to ${member.user.tag} (${member.id})`);
        
        await interaction.reply({
          embeds: [createEmbed({
            type: 'success',
            title: 'Role Added',
            description: `You've been given the **${role.name}** role.`,
            timestamp: true
          })],
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error(`Error toggling role ${roleId} for user ${member.id}:`, error);
      
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `I don't have permission to give you the ${role.name} role. Please contact a server administrator.`,
          timestamp: true
        })],
        ephemeral: true
      });
    }
  } catch (error) {
    logger.error('Error handling role reaction button:', error);
    
    // Only reply if the interaction hasn't been replied to yet
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'An error occurred while processing your request.',
          timestamp: true
        })],
        ephemeral: true
      });
    }
  }
}

/**
 * Creates a string select menu for role reactions
 * @param buttons Array of role reaction buttons from the database
 * @returns Array with a single action row containing the select menu
 */
export function createRoleReactionSelectMenu(buttons?: RoleReactionButton[]) {
  logger.debug('Creating role reaction select menu from:', buttons);
  
  if (!buttons || buttons.length === 0) {
    return [];
  }

  // Create the select menu with options for each role
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('role_select')
    .setPlaceholder('Select a role')
    .setMinValues(0)
    .setMaxValues(buttons.length); // Allow selecting multiple roles

  // Add options for each role
  for (const button of buttons) {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(button.label)
      .setValue(`role_${button.role_reaction_id}_${button.role_id}`);

    // Add emoji if present
    if (button.emoji) {
      // Check if this is a custom emoji in Discord format
      const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/;
      const customEmojiMatch = button.emoji.match(emojiRegex);
      
      if (customEmojiMatch) {
        // This is a custom emoji in Discord format: <:name:id> or <a:name:id>
        const isAnimated = button.emoji.startsWith('<a:');
        const name = customEmojiMatch[1];
        const id = customEmojiMatch[2];
        
        logger.debug(`Processing custom emoji for select menu: name=${name}, id=${id}, animated=${isAnimated}`);
        
        option.setEmoji({
          name,
          id,
          animated: isAnimated
        });
      } else {
        // This is a unicode emoji
        option.setEmoji(button.emoji);
      }
    }

    selectMenu.addOptions(option);
  }

  // Create an action row with the select menu
  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(selectMenu);

  return [row];
}

/**
 * Handles select menu interactions for role reactions
 * @param interaction The select menu interaction
 */
export async function handleRoleReactionSelect(interaction: StringSelectMenuInteraction) {
  try {
    logger.debug(`Handling role reaction select menu: ${interaction.customId}`);
    
    // Immediately acknowledge the interaction to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    // Ensure pgdb exists
    if (!pgdb) {
      logger.error('Role reaction select: PostgreSQL database not available');
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Database Error',
          description: 'Database connection is not available',
          timestamp: true
        })]
      });
      return;
    }
    
    // Get the member
    const member = interaction.member as GuildMember;
    if (!member) {
      logger.error(`Member not found: ${interaction.user.id}`);
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Could not retrieve your member information.',
          timestamp: true
        })]
      });
      return;
    }

    // Get the role reaction message
    const messageId = interaction.message.id;
    const roleReaction = await pgdb.getRoleReactionByMessage(messageId);
    if (!roleReaction) {
      logger.error(`Role reaction not found for message: ${messageId}`);
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'The role reaction configuration could not be found.',
          timestamp: true
        })]
      });
      return;
    }

    // Get all available roles from the message
    const availableRoleIds = roleReaction.buttons.map(button => button.role_id);
    
    // Get the currently selected role IDs from the values
    const selectedValues = interaction.values;
    const selectedRoleIds = selectedValues.map(value => {
      const parts = value.split('_');
      return parts[2]; // role_reactionId_roleId format
    });

    // Determine which roles to add and which to remove
    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    // Check which roles should be added (selected but not had)
    for (const roleId of selectedRoleIds) {
      if (!member.roles.cache.has(roleId)) {
        rolesToAdd.push(roleId);
      }
    }

    // Check which roles should be removed (had but not selected)
    for (const roleId of availableRoleIds) {
      if (member.roles.cache.has(roleId) && !selectedRoleIds.includes(roleId)) {
        rolesToRemove.push(roleId);
      }
    }

    // Process role changes
    const addedRoles: string[] = [];
    const removedRoles: string[] = [];
    let hasErrors = false;

    // Add roles
    for (const roleId of rolesToAdd) {
      try {
        const role = await interaction.guild?.roles.fetch(roleId);
        if (role) {
          await member.roles.add(role);
          addedRoles.push(role.name);
          logger.info(`Added role ${role.name} (${roleId}) to ${member.user.tag} (${member.id})`);
        }
      } catch (error) {
        hasErrors = true;
        logger.error(`Error adding role ${roleId} to user ${member.id}:`, error);
      }
    }

    // Remove roles
    for (const roleId of rolesToRemove) {
      try {
        const role = await interaction.guild?.roles.fetch(roleId);
        if (role) {
          await member.roles.remove(role);
          removedRoles.push(role.name);
          logger.info(`Removed role ${role.name} (${roleId}) from ${member.user.tag} (${member.id})`);
        }
      } catch (error) {
        hasErrors = true;
        logger.error(`Error removing role ${roleId} from user ${member.id}:`, error);
      }
    }
  
    // Build the response message
    let description = '';
    if (addedRoles.length > 0) {
      description += `**Added roles:** ${addedRoles.join(', ')}\n`;
    }
    if (removedRoles.length > 0) {
      description += `**Removed roles:** ${removedRoles.join(', ')}`;
    }
    if (addedRoles.length === 0 && removedRoles.length === 0) {
      description = 'No role changes were made.';
    }
  
    // Add error message if there were errors
    if (hasErrors) {
      description += '\n\n⚠️ Some role changes could not be completed. This may be due to permission issues.';
    }
  
    await interaction.editReply({
      embeds: [createEmbed({
        type: hasErrors ? 'warning' : 'success',
        title: 'Role Update',
        description,
        timestamp: true
      })]
    });
  } catch (error) {
    logger.error('Error handling role reaction select menu:', error);
    
    // Only edit reply if we've already deferred, otherwise try to reply
    if (interaction.deferred) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'An error occurred while processing your request.',
          timestamp: true
        })]
      }).catch(e => logger.error('Failed to edit reply after error:', e));
    } else if (!interaction.replied) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'An error occurred while processing your request.',
          timestamp: true
        })],
        ephemeral: true
      }).catch(e => logger.error('Failed to send error reply:', e));
    }
  }
}