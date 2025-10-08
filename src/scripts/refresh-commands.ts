import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { Client, Collection } from 'discord.js';
import { config, clientOptions } from '../config/config';
import { loadCommands } from '../utils/commandLoader';
import { logger } from '../utils/logger';
import { Command } from '../types/discord';

/**
 * Utility script for refreshing commands instantly on a test server
 * Run this when you need to test command changes immediately
 */
async function refreshCommandsInstantly() {
  if (!config.TEST_GUILD_ID) {
    logger.error('TEST_GUILD_ID is not set in your .env file. Please set a test guild ID for instant command refreshing.');
    process.exit(1);
  }

  try {
    logger.info('🔄 Refreshing application commands on test server...');
    
    // Create a temporary client to load commands
    const client = new Client(clientOptions);
    client.commands = new Collection<string, Command>();
    
    // Load all commands
    const commandCount = await loadCommands(client);
    
    if (commandCount === 0) {
      logger.warn('⚠️ No commands found to deploy');
      return;
    }
    
    // Get commands from the collection
    const commandsArray = Array.from(client.commands.values());
    
    // Convert commands to JSON for REST API
    const commandData = commandsArray.map(command => command.data.toJSON());
    
    // Initialize REST API client with extended timeout
    const rest = new REST({ version: '10', timeout: 60000 }).setToken(config.BOT_TOKEN);
    
    logger.info(`📝 Found ${commandData.length} commands to refresh`);
    
    /* Rate limit optimization - skip global command clearing */
    
    // Register the new commands directly, without clearing
    logger.info(`📥 Registering ${commandData.length} commands to guild ${config.TEST_GUILD_ID}...`);
    try {
      const response = await rest.put(
        Routes.applicationGuildCommands(config.CLIENT_ID, config.TEST_GUILD_ID),
        { body: commandData }
      );
      
      if (Array.isArray(response)) {
        logger.info(`✅ Successfully registered ${response.length} commands! They should be available immediately.`);
        
        // Log command names for verification
        const commandNames = response.map(cmd => cmd.name).join(', ');
        logger.info(`Registered commands: ${commandNames}`);
      } else {
        logger.warn('⚠️ Unexpected response format, but commands may have been registered');
      }
      
      logger.info('👉 Note: This only updates commands on your test server, not globally.');
    } catch (error) {
      logger.error('❌ Error refreshing commands:', error);
      
      // Log more helpful error information for rate limits
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.includes('rate limit')) {
        logger.error('⚠️ Discord API rate limit hit. Please wait a few minutes and try again, or use npm run register');
      }
      
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Error refreshing commands:', error);
    process.exit(1);
  }
}

// Execute the refresh
refreshCommandsInstantly(); 