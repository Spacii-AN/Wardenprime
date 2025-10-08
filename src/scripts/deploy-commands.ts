import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { Client, Collection } from 'discord.js';
import { config, clientOptions } from '../config/config';
import { loadCommands } from '../utils/commandLoader';
import { logger } from '../utils/logger';
import { Command } from '../types/discord';

// Script to deploy commands to Discord
async function deployCommands() {
  try {
    logger.info('Started refreshing application commands...');
    
    // Create a temporary client to load commands
    const client = new Client(clientOptions);
    client.commands = new Collection<string, Command>();
    
    // Load all commands
    const commandCount = await loadCommands(client);
    
    if (commandCount === 0) {
      logger.warn('No commands found to deploy');
      return;
    }
    
    // Get commands from the collection
    const commandsArray = Array.from(client.commands.values());
    
    // Convert commands to JSON for REST API
    const commandData = commandsArray.map(command => command.data.toJSON());
    
    // Initialize REST API client
    const rest = new REST({ version: '10', timeout: 60000 }).setToken(config.BOT_TOKEN);
    
    // Determine deployment strategy based on command line args and config
    const deployGlobally = process.argv.includes('--global') || (config.isDev === false && !process.argv.includes('--guild-only'));
    const deployToGuild = process.argv.includes('--guild-only') || (config.TEST_GUILD_ID && config.isDev && !deployGlobally);
    
    // Deploy to specific guild if requested and guild ID is available
    if (deployToGuild && config.TEST_GUILD_ID) {
      logger.info(`Deploying ${commandData.length} commands to test guild (${config.TEST_GUILD_ID})...`);
      
      try {
        /* Rate limit optimization - no clearing of existing commands */
        
        // Deploy the new commands to the test guild in a single API call
        await rest.put(
          Routes.applicationGuildCommands(config.CLIENT_ID, config.TEST_GUILD_ID),
          { body: commandData }
        );
        
        logger.info('Successfully deployed commands to test guild - these changes are immediate');
      } catch (guildError) {
        logger.error('Error deploying commands to test guild:', guildError);
        
        // Log more helpful error information for rate limits
        if (guildError && typeof guildError === 'object' && 'message' in guildError && 
            typeof guildError.message === 'string' && guildError.message.includes('rate limit')) {
          logger.error('Discord API rate limit hit. Please wait a few minutes and try again, or use npm run register');
        }
      }
    } 
    // Deploy globally if requested
    else if (deployGlobally) {
      logger.info(`Deploying ${commandData.length} commands globally...`);
      
      try {
        /* Rate limit optimization - no clearing of guild commands */
        
        // Deploy globally in a single API call
        await rest.put(
          Routes.applicationCommands(config.CLIENT_ID),
          { body: commandData }
        );
        
        logger.info('Successfully deployed commands globally (may take up to an hour to propagate to all servers)');
      } catch (globalError) {
        logger.error('Error deploying commands globally:', globalError);
        
        // Log more helpful error information for rate limits
        if (globalError && typeof globalError === 'object' && 'message' in globalError && 
            typeof globalError.message === 'string' && globalError.message.includes('rate limit')) {
          logger.error('Discord API rate limit hit. Please wait a few minutes and try again, or use npm run register');
        }
      }
    } else {
      logger.error('No deployment target specified. Use --global for global deployment or --guild-only for guild deployment.');
      process.exit(1);
    }
    
    // Provide user feedback about command registration times
    logger.info('Command deployment summary:');
    if (deployToGuild && config.TEST_GUILD_ID) {
      logger.info(`- Test guild (${config.TEST_GUILD_ID}): Commands are available immediately`);
    } else if (deployGlobally) {
      logger.info('- Global deployment: Commands will be available in all servers within an hour');
    }
  } catch (error) {
    logger.error('Error deploying commands:', error);
    process.exit(1);
  }
}

// Execute the deployment
deployCommands(); 