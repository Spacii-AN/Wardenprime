import { Events, ThreadChannel, Client } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';

export const name = Events.ThreadCreate;
export const once = false;

export const execute: Event<typeof Events.ThreadCreate>['execute'] = async (thread: ThreadChannel) => {
  try {
    // Log the thread creation
    logger.info(`New thread created: ${thread.name} in ${thread.parent?.name || 'Unknown Channel'}`);
    
    // Check if we should auto-join this thread based on guild settings
    if (!thread.guild) {
      logger.warn(`Thread ${thread.id} has no guild, skipping auto-join check`);
      return;
    }

    const shouldJoin = await pgdb.shouldAutoJoinThread(thread.guild.id, thread.parentId || '');
    
    if (shouldJoin) {
      // Join the thread
      await thread.join();
      logger.info(`Successfully joined thread: ${thread.name} (${thread.id})`);
    } else {
      logger.info(`Skipped joining thread: ${thread.name} (${thread.id}) - filtered by guild settings`);
    }
    
  } catch (error) {
    logger.error(`Error processing thread creation ${thread.name} (${thread.id}): ${error instanceof Error ? error.message : String(error)}`);
  }
};
