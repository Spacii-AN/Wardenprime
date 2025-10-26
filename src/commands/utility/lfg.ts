import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';

// Define command as a variable first, then export it
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Manage Looking For Group (LFG) threads')
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close the current LFG thread')
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('full')
        .setDescription('Mark the current LFG squad as full')
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update the player count in the current LFG thread')
        .addIntegerOption(option =>
          option
            .setName('players')
            .setDescription('The current number of players in the squad (1-4)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(4)
        )
    ) as SlashCommandBuilder,
  
  cooldown: 3,
  
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'close':
        await handleCloseCommand(interaction);
        break;
      case 'full':
        await handleFullCommand(interaction);
        break;
      case 'update':
        await handleUpdateCommand(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Unknown Subcommand',
            description: 'Unknown subcommand provided.',
            timestamp: true
          })],
          ephemeral: true
        });
        break;
    }
  }
};

/**
 * Handles the 'close' subcommand to close an LFG thread
 */
async function handleCloseCommand(interaction: ChatInputCommandInteraction) {
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
    
    if (originalMessage.author.id !== interaction.user.id && 
        !(interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads))) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Permission Denied',
          description: 'Only the host or moderators can close this LFG.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Update the thread name to show it's closed
    const currentName = thread.name;
    let newName = currentName;
    
    if (currentName.includes('[OPEN]')) {
      newName = currentName.replace('[OPEN]', '[CLOSED]');
    } else if (currentName.includes('[FULL]')) {
      newName = currentName.replace('[FULL]', '[CLOSED]');
    }
    
    await thread.setName(newName);
    
    // Update the database
    if (pgdb) {
      const lfgSession = await pgdb.getLfgSession(thread.id);
      if (lfgSession) {
        await pgdb.updateLfgSessionStatus(lfgSession.id, 'CLOSED');
      }
    }
    
    // Send a confirmation message
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'LFG Closed',
        description: 'This LFG has been closed.',
        timestamp: true
      })]
    });
    
    // Also send a message to the thread
    await thread.send({
      embeds: [createEmbed({
        type: 'info',
        title: 'LFG Closed',
        description: `${interaction.user} has closed this LFG. The thread will be archived shortly.`,
        timestamp: true
      })]
    });
    
    // Archive the thread
    await thread.setArchived(true, 'LFG closed by host or moderator');
    
    logger.info(`LFG thread ${thread.id} closed by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error closing LFG: ${error}`);
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
 * Handles the 'full' subcommand to mark an LFG as full
 */
async function handleFullCommand(interaction: ChatInputCommandInteraction) {
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
    
    if (originalMessage.author.id !== interaction.user.id && 
        !(interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads))) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Permission Denied',
          description: 'Only the host or moderators can mark this LFG as full.',
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
      }
    }
    
    // Always set to max players (4) when marking as full
    const newPlayerCount = 4;
    
    // Update the thread name to show it's full
    const currentName = thread.name;
    let newName = currentName;
    
    if (currentName.includes('[OPEN]')) {
      newName = currentName.replace('[OPEN]', '[FULL]');
    }
    
    if (currentName.includes('[1/4]')) {
      newName = newName.replace('[1/4]', '[4/4]');
    } else if (currentName.includes('[2/4]')) {
      newName = newName.replace('[2/4]', '[4/4]');
    } else if (currentName.includes('[3/4]')) {
      newName = newName.replace('[3/4]', '[4/4]');
    }
    
    await thread.setName(newName);
    
    // Update the embed to show full status
    const messages = await thread.messages.fetch({ limit: 10 });
    const botMessages = messages.filter(m => m.author.id === interaction.client.user?.id && m.embeds.length > 0);
    
    if (botMessages.size > 0) {
      const lfgMessage = botMessages.first();
      if (lfgMessage && lfgMessage.embeds.length > 0) {
        const oldEmbed = lfgMessage.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed);
        
        // Update the players field
        const fields = oldEmbed.fields;
        for (let i = 0; i < fields.length; i++) {
          if (fields[i].name === '👤 Host Info') {
            const hostInfoField = fields[i].value;
            const updatedHostInfo = hostInfoField.replace(/Amount of Players: \d\/4/, `Amount of Players: ${newPlayerCount}/4`);
            newEmbed.spliceFields(i, 1, { name: '👤 Host Info', value: updatedHostInfo, inline: false });
            break;
          }
        }
        
        // Edit the message with the updated embed
        await lfgMessage.edit({ embeds: [newEmbed] });
      }
    }
    
    // Update the database
    if (pgdb && lfgSession) {
      await pgdb.updateLfgSessionStatus(lfgSession.id, 'FULL', newPlayerCount);
    }
    
    // Send a confirmation message
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'LFG Marked as Full',
        description: 'This LFG has been marked as full.',
        timestamp: true
      })]
    });
  } catch (error) {
    logger.error(`Error marking LFG as full: ${error}`);
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
 * Handles the 'update' subcommand to update player count
 */
async function handleUpdateCommand(interaction: ChatInputCommandInteraction) {
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
    
    if (originalMessage.author.id !== interaction.user.id && 
        !(interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads))) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Permission Denied',
          description: 'Only the host or moderators can update the player count.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Get the new player count from the command options
    const newPlayerCount = interaction.options.getInteger('players') as number;
    
    // Update the thread name with the new player count
    const currentName = thread.name;
    let newName = currentName;
    
    // Extract base name without status and count
    let baseName = currentName;
    
    // Remove status
    if (baseName.includes('[OPEN]')) {
      baseName = baseName.replace('[OPEN]', '');
    } else if (baseName.includes('[FULL]')) {
      baseName = baseName.replace('[FULL]', '');
    } else if (baseName.includes('[CLOSED]')) {
      baseName = baseName.replace('[CLOSED]', '');
    }
    
    // Remove old player count
    baseName = baseName.replace(/\[\d\/4\]/, '');
    
    // Determine the status
    const status = newPlayerCount >= 4 ? '[FULL]' : '[OPEN]';
    
    // Create new name with updated count
    newName = `${status} [${newPlayerCount}/4]${baseName}`;
    
    await thread.setName(newName);
    
    // Update the embed to show new player count
    const messages = await thread.messages.fetch({ limit: 10 });
    const botMessages = messages.filter(m => m.author.id === interaction.client.user?.id && m.embeds.length > 0);
    
    if (botMessages.size > 0) {
      const lfgMessage = botMessages.first();
      if (lfgMessage && lfgMessage.embeds.length > 0) {
        const oldEmbed = lfgMessage.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed);
        
        // Update the players field
        const fields = oldEmbed.fields;
        for (let i = 0; i < fields.length; i++) {
          if (fields[i].name === '👤 Host Info') {
            const hostInfoField = fields[i].value;
            const updatedHostInfo = hostInfoField.replace(/Amount of Players: \d\/4/, `Amount of Players: ${newPlayerCount}/4`);
            newEmbed.spliceFields(i, 1, { name: '👤 Host Info', value: updatedHostInfo, inline: false });
            break;
          }
        }
        
        // Edit the message with the updated embed
        await lfgMessage.edit({ embeds: [newEmbed] });
      }
    }
    
    // Update the database
    if (pgdb) {
      const lfgSession = await pgdb.getLfgSession(thread.id);
      if (lfgSession) {
        if (newPlayerCount >= 4) {
          await pgdb.updateLfgSessionStatus(lfgSession.id, 'FULL', newPlayerCount);
        } else {
          await pgdb.updateLfgPlayerCount(lfgSession.id, newPlayerCount);
        }
      }
    }
    
    // Send a confirmation message
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'Player Count Updated',
        description: `Updated player count to ${newPlayerCount}/4.`,
        timestamp: true
      })]
    });
    
    logger.info(`LFG thread ${thread.id} player count updated to ${newPlayerCount}/4 by ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error updating player count: ${error}`);
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

// Export the command properly
export const { data, execute } = command;
export default command; 