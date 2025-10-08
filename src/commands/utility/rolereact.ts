import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChatInputCommandInteraction, 
  TextChannel, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Role,
  EmbedBuilder,
  ChannelType,
  GuildMember,
  StringSelectMenuBuilder
} from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed, EmbedType } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';
import { ensureUserExists, ensureGuildExists } from '../../utils/dbHelpers';
import { createRoleReactionButtons, createRoleReactionSelectMenu } from '../../utils/roleReactions';

/**
 * Calculate similarity between two strings (Levenshtein distance-based)
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  // Calculate Levenshtein distance
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column of matrix
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  // Calculate similarity as 1 - normalized distance
  const maxLen = Math.max(len1, len2);
  return 1 - matrix[len1][len2] / maxLen;
}

// Remove debug logs
// console.log('Loading rolereact command...');
// logger.info('Loading rolereact command file');

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Create and manage role reaction messages')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new role reaction message')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for the embed')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Description for the embed')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to send the role reaction message to (default: current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('color')
            .setDescription('Color for the embed (hex code or basic color name)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('batchadd')
        .setDescription('Add multiple role buttons at once (up to 5)')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the role reaction message')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('role1')
            .setDescription('First role name (without @ symbol)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('emoji1')
            .setDescription('Emoji for first role')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('role2')
            .setDescription('Second role name (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('emoji2')
            .setDescription('Emoji for second role')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('role3')
            .setDescription('Third role name (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('emoji3')
            .setDescription('Emoji for third role')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('role4')
            .setDescription('Fourth role name (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('emoji4')
            .setDescription('Emoji for fourth role')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('role5')
            .setDescription('Fifth role name (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('emoji5')
            .setDescription('Emoji for fifth role')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('style')
            .setDescription('Style for all buttons (default: primary)')
            .setRequired(false)
            .addChoices(
              { name: 'Primary (Blue)', value: 'primary' },
              { name: 'Secondary (Grey)', value: 'secondary' },
              { name: 'Success (Green)', value: 'success' },
              { name: 'Danger (Red)', value: 'danger' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('quickadd')
        .setDescription('Quickly add a role with emoji in one command')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the role reaction message')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to add')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('emoji')
            .setDescription('Emoji for the button (required)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('label')
            .setDescription('Custom label for the button (default: role name)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('style')
            .setDescription('Style for the button')
            .setRequired(false)
            .addChoices(
              { name: 'Primary (Blue)', value: 'primary' },
              { name: 'Secondary (Grey)', value: 'secondary' },
              { name: 'Success (Green)', value: 'success' },
              { name: 'Danger (Red)', value: 'danger' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all role reaction messages in this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a role reaction message')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the role reaction message')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('removerole')
        .setDescription('Remove a role button from a role reaction message')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the role reaction message')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to remove')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles) as SlashCommandBuilder,
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Verify that this is a guild command
    if (!interaction.guild || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }
    
    // Verify PostgresDB is available
    if (!pgdb) {
      await interaction.reply({ content: 'Database is not available. Please try again later.', ephemeral: true });
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      // Based on the subcommand, call the appropriate handler
      if (subcommand === 'create') {
        return await handleCreateCommand(interaction);
      } else if (subcommand === 'quickadd') {
        return await handleAddRoleCommand(interaction);
      } else if (subcommand === 'removerole') {
        return await handleRemoveRoleCommand(interaction);
      } else if (subcommand === 'list') {
        return await handleListCommand(interaction);
      } else if (subcommand === 'delete') {
        return await handleDeleteCommand(interaction);
      } else if (subcommand === 'batchadd') {
        return await handleBatchAddCommand(interaction);
      }
    } catch (error) {
      logger.error(`Error executing rolereact command: ${error instanceof Error ? error.message : String(error)}`);
      await interaction.reply({ 
        content: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        ephemeral: true 
      });
    }
  }
};

/**
 * Handles the 'create' subcommand to create a new role reaction message
 */
async function handleCreateCommand(interaction: ChatInputCommandInteraction) {
  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ ephemeral: true });
  
  // Ensure pgdb exists
  if (!pgdb) {
    logger.error('Role create command: PostgreSQL database not available');
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
  
  const title = interaction.options.getString('title')!;
  const description = interaction.options.getString('description')!;
  const channelOption = interaction.options.getChannel('channel') as TextChannel;
  const colorOption = interaction.options.getString('color');
  
  // Use current channel if no channel specified
  const channel = channelOption || interaction.channel as TextChannel;
  
  // Validate the channel
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Please provide a valid text channel',
        timestamp: true
      })]
    });
    return;
  }
  
  // Check if bot has permission to send messages in the channel
  if (!channel.permissionsFor(interaction.guild!.members.me!)?.has('SendMessages')) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Permission Error',
        description: `I don't have permission to send messages in ${channel}`,
        timestamp: true
      })]
    });
    return;
  }
  
  // Create embed for the role reaction message using our utility
  const embed = createEmbed({
    title: title,
    description: description,
    fields: [
      { 
        name: 'Role', 
        value: 'Select to claim the role',
        inline: false 
      }
    ],
    timestamp: true
  });
  
  // Create an empty select menu
  const emptySelectMenu = new StringSelectMenuBuilder()
    .setCustomId('role_select')
    .setPlaceholder('No roles available yet')
    .setDisabled(true)
    .addOptions({
      label: 'No roles added yet',
      description: 'Add roles using the role commands',
      value: 'placeholder'
    });
  
  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(emptySelectMenu);
  
  try {
    // Send the embed to the channel with the empty select menu component
    const sentMessage = await channel.send({ 
      embeds: [embed],
      components: [row]
    });
  
    // Create a record in the database
    const roleReaction = await pgdb.createRoleReaction(
      interaction.guild!.id,
      channel.id,
      sentMessage.id,
      title, // Use title as the name
      interaction.user.id
    );
  
    // Send success message
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'success',
        title: 'Role Reaction Created',
        description: `Role reaction message has been created in ${channel}.`,
        fields: [
          { name: 'Title', value: title, inline: true },
          { name: 'Message ID', value: sentMessage.id, inline: true },
          { 
            name: '⚡ Quick Add (One Role)', 
            value: `\`/role quickadd message_id:${sentMessage.id} role:@Role emoji:👍\``
          },
          { 
            name: '✨ Batch Add (Up to 25 Roles)', 
            value: `\`/role batchadd message_id:${sentMessage.id} roles:@Role1:👍,@Role2:🎮,@Role3:🎵\``
          }
        ],
        timestamp: true
      })]
    });
    
    logger.info(`Created role reaction "${title}" in channel ${channel.name} by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error creating role reaction:', error);
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to create role reaction: ' + (error instanceof Error ? error.message : String(error)),
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the 'quickadd' subcommand for quickly adding roles with emoji
 */
async function handleAddRoleCommand(interaction: ChatInputCommandInteraction) {
  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ ephemeral: true });
  
  // Ensure pgdb exists
  if (!pgdb) {
    logger.error('Role quickadd command: PostgreSQL database not available');
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
  
  const messageId = interaction.options.getString('message_id')!;
  const role = interaction.options.getRole('role') as Role;
  const emojiInput = interaction.options.getString('emoji')!;
  const label = interaction.options.getString('label') || role.name;
  const style = interaction.options.getString('style') || 'primary';
  
  // Process emoji input - handle both custom and unicode emojis
  const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/;
  const customEmojiMatch = emojiInput.match(emojiRegex);
  
  let emoji: string;
  if (customEmojiMatch) {
    // This is a custom emoji - store in Discord's format
    emoji = emojiInput;
    logger.debug(`Detected custom emoji: ${emoji}`);
  } else {
    // This is a unicode emoji - use as is
    emoji = emojiInput;
    logger.debug(`Using unicode emoji: ${emoji}`);
  }
  
  // Check if the role exists
  if (!role) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Please provide a valid role',
        timestamp: true
      })]
    });
    return;
  }
  
  // Check if the bot has the permissions to assign this role
  const member = interaction.guild!.members.me!;
  if (role.position >= member.roles.highest.position) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Permission Error',
        description: `I don't have permission to assign the ${role.name} role. It's positioned higher than my highest role.`,
        timestamp: true
      })]
    });
    return;
  }
  
  // Get the role reaction from the database
  const roleReaction = await pgdb.getRoleReactionByMessage(messageId);
  
  if (!roleReaction) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'No role reaction found with that message ID',
        timestamp: true
      })]
    });
    return;
  }
  
  // Check if this is the user's role reaction or if they have admin permissions
  if (roleReaction.creator_id !== interaction.user.id && 
      !(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Permission Error',
        description: 'You can only modify role reactions that you created, unless you have Administrator permissions',
        timestamp: true
      })]
    });
    return;
  }
  
  // Check if we already have 25 roles (the limit for select menus)
  if (roleReaction.buttons.length >= 25) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Limit Reached',
        description: 'This role reaction already has 25 roles, which is the maximum allowed.',
        timestamp: true
      })]
    });
    return;
  }
  
  // Check if this role is already in the message
  const existingButton = roleReaction.buttons.find(b => b.role_id === role.id);
  if (existingButton) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Role Already Added',
        description: `The role ${role.name} is already part of this role reaction.`,
        timestamp: true
      })]
    });
    return;
  }
  
  // Get the target message
  let targetMessage;
  try {
    targetMessage = await (interaction.channel as TextChannel).messages.fetch(messageId);
  } catch (error) {
    logger.error(`Could not fetch message ${messageId}:`, error);
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Could not find the specified message in this channel.',
        timestamp: true
      })]
    });
    return;
  }
  
  try {
    // Add the button to the database
    const position = roleReaction.buttons.length;
    await pgdb.addRoleReactionButton(
      roleReaction.id,
      role.id,
      emoji,
      label,
      style,
      position
    );
    
    // Get the updated role reaction
    const updatedRoleReaction = await pgdb.getRoleReactionById(roleReaction.id);
    
    if (!updatedRoleReaction) {
      await interaction.editReply({ 
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Could not retrieve the updated role reaction.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Create updated embed with role fields
    const originalEmbed = targetMessage.embeds[0];
    const updatedEmbed = new EmbedBuilder()
      .setTitle(originalEmbed.title || roleReaction.name)
      .setDescription(originalEmbed.description || '')
      .setColor(originalEmbed.color || 'Blue')
      .setTimestamp();
    
    // Only keep fields that aren't role-related
    // Either keep only the base 'Role' field or filter out all role-related fields
    const existingFields = originalEmbed.fields?.filter(field => 
      field.name === 'Role' || 
      (!field.name.includes('🎮') && 
       !field.name.includes('👍') && 
       !field.name.includes('🎵') && 
       !field.value.includes('React to receive pings for'))
    );
    
    if (existingFields && existingFields.length > 0) {
      updatedEmbed.addFields(existingFields);
    }
    
    // Add base role instruction field if it doesn't exist
    if (!originalEmbed.fields?.some(field => field.name === 'Role')) {
      updatedEmbed.addFields({ name: 'Role', value: 'Select to claim the role', inline: false });
    }
    
    // Add fields for each role (fresh from the database)
    updatedRoleReaction.buttons.forEach(button => {
      updatedEmbed.addFields({
        name: `${button.emoji} ${button.label}`,
        value: `React to receive pings for <@&${button.role_id}>`,
        inline: true
      });
    });
    
    // Update the message with the new select menu and updated embed
    const components = createRoleReactionSelectMenu(updatedRoleReaction.buttons);
    
    try {
      await targetMessage.edit({ 
        embeds: [updatedEmbed],
        components 
      });
      
      await interaction.editReply({ 
        embeds: [createEmbed({
          type: 'success',
          title: 'Role Added',
          description: `Added the role ${role.name} to the role reaction.`,
          timestamp: true
        })]
      });
      
      logger.info(`Added role ${role.name} (${role.id}) to role reaction ${roleReaction.id} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error updating message with new buttons:`, error);
      await interaction.editReply({ 
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Could not update the message with the new role. The role was added to the database but the message could not be updated.',
          timestamp: true
        })]
      });
    }
  } catch (error) {
    logger.error(`Error adding role to reaction:`, error);
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to add role to reaction: ' + (error instanceof Error ? error.message : String(error)),
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the 'list' subcommand to list all role reactions in the server
 */
async function handleListCommand(interaction: ChatInputCommandInteraction) {
  // Ensure pgdb exists
  if (!pgdb) {
    logger.error('Role list command: PostgreSQL database not available');
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
  
  const roleReactions = await pgdb.getRoleReactionsByGuild(interaction.guild!.id);
  
  if (roleReactions.length === 0) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'info',
        title: 'No Role Reactions',
        description: 'This server has no role reaction messages set up yet.',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  const items = await Promise.all(roleReactions.map(async (rr, index) => {
    // Try to get channel name
    let channelName = 'Unknown Channel';
    try {
      const channel = await interaction.guild!.channels.fetch(rr.channel_id);
      if (channel) {
        channelName = channel.name;
      }
    } catch (e) {
      // Channel may no longer exist
    }
    
    return `${index + 1}. **${rr.name}** (ID: ${rr.id})\n` +
           `   Channel: <#${rr.channel_id}> (${channelName})\n` +
           `   Message ID: ${rr.message_id}\n` +
           `   Created: <t:${Math.floor(new Date(rr.created_at).getTime() / 1000)}:R>\n`;
  }));
  
  await interaction.reply({ 
    embeds: [createEmbed({
      type: 'info',
      title: 'Role Reaction Messages',
      description: items.join('\n'),
      timestamp: true
    })],
    ephemeral: true 
  });
}

/**
 * Handles the 'delete' subcommand to delete a role reaction
 */
async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  // Ensure pgdb exists
  if (!pgdb) {
    logger.error('Role delete command: PostgreSQL database not available');
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
  
  const messageId = interaction.options.getString('message_id')!;
  
  // Get the role reaction from the database
  const roleReaction = await pgdb.getRoleReactionByMessage(messageId);
  
  if (!roleReaction) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'No role reaction found with that message ID',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Check if this is the user's role reaction or if they have admin permissions
  if (roleReaction.creator_id !== interaction.user.id && 
      !(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Permission Error',
        description: 'You can only delete role reactions that you created, unless you have Administrator permissions',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Defer reply since this might take some time
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Try to find and remove the message components first
    let messageRemoved = false;
  try {
    const channel = await interaction.guild!.channels.fetch(roleReaction.channel_id) as TextChannel;
    
    if (channel) {
      try {
        const message = await channel.messages.fetch(roleReaction.message_id);
        
        // Update the message to remove the buttons
        await message.edit({
          embeds: message.embeds,
          components: []
        });
          
          // Optionally delete the message
          await message.delete();
          messageRemoved = true;
      } catch (e) {
          // Message may have been deleted already, that's fine
          logger.debug(`Could not find message ${roleReaction.message_id} to remove components: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
      // Channel may have been deleted, continue with database cleanup
      logger.debug(`Could not find channel ${roleReaction.channel_id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // Delete the role reaction from the database
    await pgdb.deleteRoleReaction(roleReaction.id);
  
    // Send success message
    await interaction.editReply({ 
    embeds: [createEmbed({
      type: 'success',
      title: 'Role Reaction Deleted',
        description: `Successfully deleted the role reaction "${roleReaction.name}".${messageRemoved ? ' The message was also removed.' : ''}`,
        timestamp: true
      })]
    });
    
    logger.info(`Deleted role reaction ${roleReaction.id} (${roleReaction.name}) by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error deleting role reaction: ${error instanceof Error ? error.message : String(error)}`);
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `An error occurred while deleting the role reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the 'batchadd' subcommand to add multiple roles at once
 */
async function handleBatchAddCommand(interaction: ChatInputCommandInteraction) {
  // Ensure pgdb exists
  if (!pgdb) {
    logger.error('Role batchadd command: PostgreSQL database not available');
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
  
  const messageId = interaction.options.getString('message_id')!;
  const role1 = interaction.options.getString('role1')!;
  const emoji1 = interaction.options.getString('emoji1')!;
  const role2 = interaction.options.getString('role2');
  const emoji2 = interaction.options.getString('emoji2');
  const role3 = interaction.options.getString('role3');
  const emoji3 = interaction.options.getString('emoji3');
  const role4 = interaction.options.getString('role4');
  const emoji4 = interaction.options.getString('emoji4');
  const role5 = interaction.options.getString('role5');
  const emoji5 = interaction.options.getString('emoji5');
  const defaultStyle = interaction.options.getString('style') || 'primary';
  
  logger.debug(`Batchadd command called by ${interaction.user.tag} (${interaction.user.id}) for message ${messageId}`);
  logger.debug(`Role1: ${role1}, Emoji1: ${emoji1}`);
  logger.debug(`Role2: ${role2}, Emoji2: ${emoji2}`);
  logger.debug(`Role3: ${role3}, Emoji3: ${emoji3}`);
  logger.debug(`Role4: ${role4}, Emoji4: ${emoji4}`);
  logger.debug(`Role5: ${role5}, Emoji5: ${emoji5}`);
  
  // Get the role reaction from the database
  const roleReaction = await pgdb.getRoleReactionByMessage(messageId);
  
  if (!roleReaction) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'No role reaction found with that message ID',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Check if this is the user's role reaction or if they have admin permissions
  if (roleReaction.creator_id !== interaction.user.id && 
      !(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Permission Error',
        description: 'You can only modify role reactions that you created, unless you have Administrator permissions',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Prepare role-emoji pairs, ensuring both role and emoji are provided
  const rolePairs: Array<{roleName: string, emoji: string}> = [];
  
  if (role1 && emoji1) rolePairs.push({roleName: role1, emoji: emoji1});
  if (role2 && emoji2) rolePairs.push({roleName: role2, emoji: emoji2});
  if (role3 && emoji3) rolePairs.push({roleName: role3, emoji: emoji3});
  if (role4 && emoji4) rolePairs.push({roleName: role4, emoji: emoji4});
  if (role5 && emoji5) rolePairs.push({roleName: role5, emoji: emoji5});
  
  // Check if we have at least one valid pair
  if (rolePairs.length === 0) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Invalid Input',
        description: 'Please provide at least one valid role and emoji pair.',
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Check for any role without an emoji or vice versa
  const missingPairs = [];
  if (role1 && !emoji1) missingPairs.push(`Role1 "${role1}" is missing an emoji`);
  if (!role1 && emoji1) missingPairs.push(`Emoji1 "${emoji1}" is missing a role name`);
  if (role2 && !emoji2) missingPairs.push(`Role2 "${role2}" is missing an emoji`);
  if (!role2 && emoji2) missingPairs.push(`Emoji2 "${emoji2}" is missing a role name`);
  if (role3 && !emoji3) missingPairs.push(`Role3 "${role3}" is missing an emoji`);
  if (!role3 && emoji3) missingPairs.push(`Emoji3 "${emoji3}" is missing a role name`);
  if (role4 && !emoji4) missingPairs.push(`Role4 "${role4}" is missing an emoji`);
  if (!role4 && emoji4) missingPairs.push(`Emoji4 "${emoji4}" is missing a role name`);
  if (role5 && !emoji5) missingPairs.push(`Role5 "${role5}" is missing an emoji`);
  if (!role5 && emoji5) missingPairs.push(`Emoji5 "${emoji5}" is missing a role name`);
  
  if (missingPairs.length > 0) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Missing Values',
        description: `The following errors were found:\n${missingPairs.join('\n')}`,
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }
  
  // Check if we already have 25 buttons (Discord's limit)
  const currentButtonCount = roleReaction.buttons?.length ?? 0;
  
  if (currentButtonCount + rolePairs.length > 25) {
    await interaction.reply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Too Many Buttons',
        description: `This message already has ${currentButtonCount} buttons. Adding ${rolePairs.length} more would exceed Discord's limit of 25 buttons per message.`,
        timestamp: true
      })],
      ephemeral: true 
    });
    return;
  }

  // Defer reply since this might take some time
  await interaction.deferReply({ ephemeral: true });
  
  // Process each role and emoji pair
  const successRoles: string[] = [];
  const failedRoles: { role: string, reason: string }[] = [];
  let position = currentButtonCount;
  
  await interaction.guild!.roles.fetch(); // Fetch all roles once
  const allRoles = interaction.guild!.roles.cache;
  
  for (const pair of rolePairs) {
    const roleName = pair.roleName;
    const emojiInput = pair.emoji;
    
    logger.debug(`Processing pair: roleName="${roleName}", emoji="${emojiInput}"`);
    
    let role: Role | null = null;
    
    // Check if the input is a role mention format <@&ID>
    const roleIdMatch = roleName.match(/^<@&(\d+)>$/);
    if (roleIdMatch) {
      const roleId = roleIdMatch[1];
      logger.debug(`Detected role mention format, trying to fetch by ID: ${roleId}`);
      role = allRoles.get(roleId) || null;
    } else {
      // Find the role by name - remove @ if present
      const cleanRoleName = roleName.startsWith('@') ? roleName.substring(1) : roleName;
      
      // Log all available roles for debugging purposes
      logger.debug(`Available roles in guild (${allRoles.size}): ${Array.from(allRoles.values()).map(r => r.name).join(', ')}`);
      
      // Try different methods to find the role by name
      role = allRoles.find(r => 
        r.name.toLowerCase() === cleanRoleName.toLowerCase() ||
        r.name.toLowerCase().trim() === cleanRoleName.toLowerCase().trim()
      );
      
      // If still not found, try more loose matching
      if (!role) {
        // Try matching with spaces removed
        const normalizedRoleName = cleanRoleName.toLowerCase().replace(/\s+/g, '');
        role = allRoles.find(r => r.name.toLowerCase().replace(/\s+/g, '') === normalizedRoleName);
        
        // If still not found, try partial matches
        if (!role) {
          role = allRoles.find(r => 
            r.name.toLowerCase().includes(cleanRoleName.toLowerCase()) ||
            cleanRoleName.toLowerCase().includes(r.name.toLowerCase())
          );
        }
      }
    }
    
    if (!role) {
      // Find similar roles to suggest
      const cleanRoleNameForSimilarity = roleName.startsWith('@') ? roleName.substring(1) : roleName; // Use original name without @
      const similarRoles = Array.from(allRoles.values())
        .filter(r => {
          const similarity = calculateSimilarity(r.name.toLowerCase(), cleanRoleNameForSimilarity.toLowerCase());
          return similarity > 0.4; // Only include roles with some similarity
        })
        .sort((a, b) => {
          const simA = calculateSimilarity(a.name.toLowerCase(), cleanRoleNameForSimilarity.toLowerCase());
          const simB = calculateSimilarity(b.name.toLowerCase(), cleanRoleNameForSimilarity.toLowerCase());
          return simB - simA; // Sort by descending similarity
        })
        .slice(0, 3); // Take top 3 most similar roles
      
      const reason = similarRoles.length > 0 
        ? `Role not found. Did you mean: ${similarRoles.map(r => `"${r.name}"`).join(', ')}?`
        : 'Role not found';
      
      failedRoles.push({ 
        role: roleName, 
        reason: reason
      });
      logger.debug(`Role not found: "${roleName}" - tried ID match and various name matching methods`);
      if (similarRoles.length > 0) {
        logger.debug(`Similar roles: ${similarRoles.map(r => r.name).join(', ')}`);
      }
      continue;
    }
    
    // Process emoji
    let emoji = emojiInput;
    
    // Handle custom emoji name format like :emoji_name:
    if (emoji.startsWith(':') && emoji.endsWith(':') && emoji.length > 2) {
      const emojiName = emoji.slice(1, -1); // Remove the colons
      logger.debug(`Detected custom emoji identifier format: ${emojiName}`);
      
      // Try to find the emoji in the guild
      const guildEmoji = interaction.guild!.emojis.cache.find(
        e => e.name === emojiName
      );
      
      if (guildEmoji) {
        // Convert to the proper Discord format <:name:id> or <a:name:id>
        emoji = guildEmoji.animated ? 
          `<a:${guildEmoji.name}:${guildEmoji.id}>` : 
          `<:${guildEmoji.name}:${guildEmoji.id}>`;
        logger.debug(`Found matching guild emoji: ${emoji}`);
      } else {
        logger.debug(`No matching guild emoji found for ${emojiName}, will use as provided`);
      }
    }
    
    logger.debug(`Using emoji: ${emoji}`);
    
    // Check if the bot has permissions to assign this role
    const member = interaction.guild!.members.me!;
    if (role.position >= member.roles.highest.position) {
      failedRoles.push({ 
        role: role.name, 
        reason: "Bot doesn't have permission to assign this role (role is higher than bot's highest role)" 
      });
      logger.debug(`Bot can't assign role ${role.name} due to permission hierarchy`);
      continue;
    }
    
    // Add the role button to the database
    try {
      await pgdb.addRoleReactionButton(
        roleReaction.id.toString(),
        role.id,
        emoji,
        role.name, // Use role name as label
        defaultStyle,
        position++
      );
      
      successRoles.push(`${role.name} (${emoji})`);
      logger.debug(`Successfully added role ${role.name} with emoji ${emoji}`);
    } catch (error) {
      failedRoles.push({ 
        role: role.name, 
        reason: 'Database error: ' + (error instanceof Error ? error.message : String(error))
      });
      logger.error(`Error adding role ${role.name}:`, error);
    }
  }
  
  // Update the message with new buttons
  const updatedRoleReaction = await pgdb.getRoleReactionById(roleReaction.id.toString());
  
  if (!updatedRoleReaction) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to update the role reaction',
        timestamp: true
      })]
    });
    return;
  }
  
  // Get the channel and message
  const channel = await interaction.guild!.channels.fetch(updatedRoleReaction.channel_id) as TextChannel;
  
  if (!channel) {
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'The channel for this role reaction no longer exists',
        timestamp: true
      })]
    });
    return;
  }
  
  try {
    const message = await channel.messages.fetch(updatedRoleReaction.message_id);
    
    // Update the message with the new buttons
    const components = createRoleReactionSelectMenu(updatedRoleReaction.buttons);
    
    // Create updated embed with role fields
    const originalEmbed = message.embeds[0];
    const updatedEmbed = new EmbedBuilder()
      .setTitle(originalEmbed.title || updatedRoleReaction.name)
      .setDescription(originalEmbed.description || '')
      .setColor(originalEmbed.color || 'Blue')
      .setTimestamp();
    
    // Only keep fields that aren't role-related
    // Either keep only the base 'Role' field or filter out all role-related fields
    const existingFields = originalEmbed.fields?.filter(field => 
      field.name === 'Role' || 
      (!field.name.includes('🎮') && 
       !field.name.includes('👍') && 
       !field.name.includes('🎵') && 
       !field.value.includes('React to receive pings for'))
    );
    
    if (existingFields && existingFields.length > 0) {
      updatedEmbed.addFields(existingFields);
    }
    
    // Add base role instruction field if it doesn't exist
    if (!originalEmbed.fields?.some(field => field.name === 'Role')) {
      updatedEmbed.addFields({ name: 'Role', value: 'Select to claim the role', inline: false });
    }
    
    // Add fields for each role (fresh from the database)
    updatedRoleReaction.buttons.forEach(button => {
      updatedEmbed.addFields({
        name: `${button.emoji} ${button.label}`,
        value: `React to receive pings for <@&${button.role_id}>`,
        inline: true
      });
    });
    
    await message.edit({
      embeds: [updatedEmbed],
      components: components
    });
    
    // Build the response embed
    const embed = createEmbed({
      type: successRoles.length > 0 ? 'success' : 'error',
      title: 'Batch Add Results',
      timestamp: true
    });
    
    if (successRoles.length > 0) {
      embed.addFields({
        name: `✅ Successfully added ${successRoles.length} role${successRoles.length !== 1 ? 's' : ''}`,
        value: successRoles.join('\n')
      });
    }
    
    if (failedRoles.length > 0) {
      embed.addFields({
        name: `❌ Failed to add ${failedRoles.length} role${failedRoles.length !== 1 ? 's' : ''}`,
        value: failedRoles.map(r => `${r.role}: ${r.reason}`).join('\n')
      });
    }
    
    // Add a field with the current button count
    const totalButtons = updatedRoleReaction.buttons?.length ?? 0;
    embed.addFields({
      name: 'Current Status',
      value: `${totalButtons}/25 buttons used (${25 - totalButtons} remaining)`
    });
    
    // Add a field with examples of how to add more
    if (totalButtons < 25) {
      embed.addFields({
        name: 'Add More Roles',
        value: `To add more roles, use:\n\`/role batchadd message_id:${messageId} role1:Role1 emoji1:👍 role2:Role2 emoji2:🎉\``
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`Batch added ${successRoles.length} roles to reaction ${updatedRoleReaction.name} (${updatedRoleReaction.id}) by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error updating role reaction message:', error);
    await interaction.editReply({ 
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to update the message. It may have been deleted.',
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the 'removerole' subcommand to remove a role button from a role reaction message
 */
async function handleRemoveRoleCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  const messageId = interaction.options.getString('message_id', true);
  const role = interaction.options.getRole('role', true);
  
  // Check if the user has permission to manage roles
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply({ content: 'You do not have permission to manage roles.' });
    return;
  }
  
  // Check if the role reaction exists
  const roleReaction = await pgdb.getRoleReactionByMessage(messageId);
  if (!roleReaction) {
    await interaction.editReply({ content: 'Could not find a role reaction message with that ID.' });
    return;
  }
  
  // Check if the message is in this guild
  if (roleReaction.guild_id !== interaction.guildId) {
    await interaction.editReply({ content: 'That role reaction message is not in this server.' });
    return;
  }
  
  try {
    // Remove the button from the database
    await pgdb.removeRoleReactionButton(roleReaction.id, role.id);
    
    // Get the updated buttons
    const buttons = await pgdb.getRoleReactionButtons(roleReaction.id);
    
    // Try to find the message
    try {
      const channel = await interaction.guild.channels.fetch(roleReaction.channel_id) as TextChannel;
      const message = await channel.messages.fetch(roleReaction.message_id);
      
      // Create updated embed with role fields
      const originalEmbed = message.embeds[0];
      const updatedEmbed = new EmbedBuilder()
        .setTitle(originalEmbed.title || roleReaction.name)
        .setDescription(originalEmbed.description || '')
        .setColor(originalEmbed.color || 'Blue')
        .setTimestamp();
      
      // Only keep fields that aren't role-related
      // Either keep only the base 'Role' field or filter out all role-related fields
      const existingFields = originalEmbed.fields?.filter(field => 
        field.name === 'Role' || 
        (!field.name.includes('🎮') && 
         !field.name.includes('👍') && 
         !field.name.includes('🎵') && 
         !field.value.includes('React to receive pings for'))
      );
      
      if (existingFields && existingFields.length > 0) {
        updatedEmbed.addFields(existingFields);
      }
      
      // Add base role instruction field if it doesn't exist
      if (!originalEmbed.fields?.some(field => field.name === 'Role')) {
        updatedEmbed.addFields({ name: 'Role', value: 'Select to claim the role', inline: false });
      }
      
      // Add fields for each role (fresh from the database)
      buttons.forEach(button => {
        updatedEmbed.addFields({
          name: `${button.emoji} ${button.label}`,
          value: `React to receive pings for <@&${button.role_id}>`,
          inline: true
        });
      });
      
      // Update the message with new components
      if (buttons.length > 0) {
        const components = createRoleReactionSelectMenu(buttons);
        await message.edit({ embeds: [updatedEmbed], components });
      } else {
        // If no buttons left, just update the embed
        await message.edit({ embeds: [updatedEmbed], components: [] });
      }
      
      await interaction.editReply({ 
        content: `Successfully removed ${role.name} from the role reaction message.`
      });
    } catch (error) {
      logger.error(`Error updating message for role reaction: ${error}`);
      await interaction.editReply({ 
        content: `Role removed from database, but couldn't update the message. It may have been deleted.`
      });
    }
  } catch (error) {
    logger.error(`Error removing role from reaction: ${error instanceof Error ? error.message : String(error)}`);
    await interaction.editReply({ 
      content: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

// End of file 
module.exports = command;