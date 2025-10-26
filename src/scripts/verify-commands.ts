/**
 * Utility script to verify registered commands on Discord
 * This doesn't register new commands, it just checks what's already registered
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { config } from '../config/config';
import { logger } from '../utils/logger';

async function verifyRegisteredCommands() {
  try {
    logger.info('Starting command verification...');
    
    // Check if required config is available
    if (!config.BOT_TOKEN || !config.CLIENT_ID) {
      logger.error('Missing BOT_TOKEN or CLIENT_ID in .env file');
      process.exit(1);
    }
    
    // Initialize REST API client with timeout
    const rest = new REST({ version: '10', timeout: 30000 }).setToken(config.BOT_TOKEN);
    
    // Check for guild commands if a test guild is configured
    if (config.TEST_GUILD_ID) {
      try {
        logger.info(`Checking commands registered in test guild (${config.TEST_GUILD_ID})...`);
        const guildCommands = await rest.get(
          Routes.applicationGuildCommands(config.CLIENT_ID, config.TEST_GUILD_ID)
        ) as any[];
        
        if (Array.isArray(guildCommands) && guildCommands.length > 0) {
          logger.info(`Found ${guildCommands.length} commands registered in test guild:`);
          guildCommands.forEach(cmd => {
            logger.info(`- ${cmd.name} (ID: ${cmd.id})`);
          });
        } else {
          logger.warn('No commands found registered in test guild!');
        }
      } catch (guildError) {
        logger.error('Error getting guild commands:', guildError);
      }
    }
    
    // Always check global commands as well
    try {
      logger.info('Checking globally registered commands...');
      const globalCommands = await rest.get(
        Routes.applicationCommands(config.CLIENT_ID)
      ) as any[];
      
      if (Array.isArray(globalCommands) && globalCommands.length > 0) {
        logger.info(`Found ${globalCommands.length} commands registered globally:`);
        globalCommands.forEach(cmd => {
          logger.info(`- ${cmd.name} (ID: ${cmd.id})`);
        });
      } else {
        logger.warn('No commands found registered globally!');
      }
    } catch (globalError) {
      logger.error('Error getting global commands:', globalError);
    }
    
    logger.info('Command verification complete!');
  } catch (error) {
    logger.error('Error in verification process:', error);
    process.exit(1);
  }
}

// Execute the verification
verifyRegisteredCommands(); 