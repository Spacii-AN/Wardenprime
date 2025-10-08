import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder';
import { triggerDictionaryUpdate, getDictionaryUpdaterStatus } from '../../services/dictionaryUpdater';

// Bot owner ID from environment variable
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1036768659269500999';

// Create the command data
const data = new SlashCommandBuilder()
  .setName('update-dictionaries')
  .setDescription('Update dictionary files from GitHub')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check the status of the dictionary updater')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('trigger')
      .setDescription('Manually trigger a dictionary update')
  );

// Execute function
async function execute(interaction: ChatInputCommandInteraction) {
  // Check if the user is the bot owner
  if (interaction.user.id !== BOT_OWNER_ID) {
    await interaction.reply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Access Denied',
        description: 'This command can only be used by the bot owner.',
        timestamp: true
      })],
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'status') {
    await handleStatusCommand(interaction);
  } else if (subcommand === 'trigger') {
    await handleTriggerCommand(interaction);
  }
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
  // Get the current status
  const status = getDictionaryUpdaterStatus();
  
  // Format timestamps
  const lastUpdateTime = status.lastUpdateTime > 0 
    ? new Date(status.lastUpdateTime).toISOString() 
    : 'Never';
  
  const nextUpdateTime = status.nextUpdateTime > Date.now() 
    ? `<t:${Math.floor(status.nextUpdateTime / 1000)}:R>` 
    : 'Pending';
    
  const rateLimitReset = `<t:${Math.floor(status.rateLimit.resetTime / 1000)}:R>`;
  
  // Create embed
  const embed = createEmbed({
    type: 'info',
    title: 'Dictionary Updater Status',
    description: `Current status of the dictionary updater service.`,
    fields: [
      {
        name: '🔄 Update in Progress',
        value: status.isUpdating ? 'Yes' : 'No',
        inline: true
      },
      {
        name: '⏱️ Last Update',
        value: lastUpdateTime,
        inline: true
      },
      {
        name: '⏭️ Next Update',
        value: nextUpdateTime,
        inline: true
      },
      {
        name: '📊 GitHub API Limits',
        value: `${status.rateLimit.remaining}/${status.rateLimit.total} remaining\nResets ${rateLimitReset}`,
        inline: false
      },
      {
        name: '💡 Tip',
        value: 'Add a GitHub token as `GITHUB_TOKEN` in your environment variables to increase rate limits.',
        inline: false
      }
    ],
    timestamp: true
  });
  
  await interaction.reply({ embeds: [embed] });
}

async function handleTriggerCommand(interaction: ChatInputCommandInteraction) {
  // Initial response
  await interaction.reply({
    embeds: [createEmbed({
      type: 'info',
      title: 'Dictionary Update Triggered',
      description: 'Starting dictionary update process. This may take a few minutes...',
      timestamp: true
    })]
  });
  
  try {
    // Trigger the update
    const status = getDictionaryUpdaterStatus();
    
    if (status.isUpdating) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'warning',
          title: 'Dictionary Update Already in Progress',
          description: 'An update is already running. Please wait for it to complete.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Trigger and wait for result
    const success = await triggerDictionaryUpdate();
    
    if (success) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'Dictionary Update Complete',
          description: 'All dictionary files have been updated successfully.',
          timestamp: true
        })]
      });
    } else {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Dictionary Update Incomplete',
          description: 'Some files could not be updated. Check the logs for details.',
          timestamp: true
        })]
      });
    }
  } catch (error) {
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Dictionary Update Failed',
        description: `An error occurred during the update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
}

// Export using CommonJS format for compatibility with require()
module.exports = {
  data,
  execute,
  isNotPublic: true
}; 