import fs from 'fs';
import path from 'path';
import { Client, Collection } from 'discord.js';
import { Command } from '../types/discord';
import { logger } from './logger';

/**
 * Load all command modules from the commands directory
 * @param client The Discord client to attach commands to
 * @returns Promise resolving to the number of commands loaded
 */
export async function loadCommands(client: Client): Promise<number> {
  // Create a new collection for commands
  client.commands = new Collection();
  
  // Get the commands directory path
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  try {
    // Check if commands directory exists
    if (!fs.existsSync(commandsPath)) {
      logger.warn(`Commands directory not found at ${commandsPath}`);
      return 0;
    }
    
    // Get all category folders in the commands directory
    const categories = fs.readdirSync(commandsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    let loadedCount = 0;
    
    // Process each category
    for (const category of categories) {
      const categoryPath = path.join(commandsPath, category);
      
      // Get all command files in the category
      const commandFiles = fs.readdirSync(categoryPath)
        .filter(file => (file.endsWith('.ts') || file.endsWith('.js')) && !file.startsWith('_'));
      
      // Process each command file
      for (const file of commandFiles) {
        const filePath = path.join(categoryPath, file);
        logger.info(`Attempting to load command from: ${filePath}`);
        
        try {
          // Import the command module
          const command = require(filePath);
          
          // Check if it has the required properties
          if ('data' in command && 'execute' in command) {
            // Add the command to the collection
            const commandName = command.data.name;
            client.commands.set(commandName, command as Command);
            loadedCount++;
            logger.command(`Loaded command: ${commandName} (${category}/${file})`);
            // Log detailed command info
            logger.debug(`Command details: ${commandName}`, {
              name: commandName,
              description: command.data.description || 'No description',
              options: command.data.options?.length || 0,
              file: filePath
            });
          } else {
            logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
          }
        } catch (error) {
          logger.error(`Error loading command from ${filePath}:`, error);
        }
      }
    }
    
    logger.info(`Loaded ${loadedCount} commands total`);
    return loadedCount;
  } catch (error) {
    logger.error('Error loading commands:', error);
    return 0;
  }
} 