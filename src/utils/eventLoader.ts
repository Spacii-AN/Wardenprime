import fs from 'fs';
import path from 'path';
import { Client } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from './logger';

/**
 * Dynamically loads all event modules from the events directory
 * @returns The number of events loaded
 */
export async function loadEvents(client: Client): Promise<number> {
  const eventsPath = path.join(__dirname, '..', 'events');
  let loadedCount = 0;
  
  try {
    // Check if events directory exists
    if (!fs.existsSync(eventsPath)) {
      logger.warn(`Events directory not found at ${eventsPath}`);
      return loadedCount;
    }
    
    // Get all event files
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      
      try {
        // Import the event module
        const event = require(filePath) as Event<any>;
        
        if ('name' in event && 'execute' in event) {
          // Register the event with the client
          if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
          } else {
            client.on(event.name, (...args) => event.execute(...args));
          }
          
          loadedCount++;
          logger.event(`Loaded event: ${event.name}`);
        } else {
          logger.warn(`Event at ${filePath} is missing required "name" or "execute" property`);
        }
      } catch (error) {
        logger.error(`Error loading event from ${filePath}:`, error);
      }
    }
    
    logger.info(`Loaded ${loadedCount} events`);
  } catch (error) {
    logger.error('Error loading events:', error);
  }
  
  return loadedCount;
} 