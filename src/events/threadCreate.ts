import { Events, ThreadChannel, Client } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';

export const name = Events.ThreadCreate;
export const once = false;

export const execute: Event<typeof Events.ThreadCreate>['execute'] = async (thread: ThreadChannel) => {
  try {
    // Log the thread creation
    logger.info(`New thread created: ${thread.name} in ${thread.parent?.name || 'Unknown Channel'}`);
    
    // Join the thread
    await thread.join();
    logger.info(`Successfully joined thread: ${thread.name} (${thread.id})`);
    
  } catch (error) {
    logger.error(`Error joining thread ${thread.name} (${thread.id}): ${error instanceof Error ? error.message : String(error)}`);
  }
};
