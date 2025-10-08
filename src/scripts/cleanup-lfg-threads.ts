/**
 * Script to clean up old LFG threads
 * This can be run manually or scheduled as a cron job
 */

import { config } from '../config/config';
import { pgdb } from '../services/postgresDatabase';
import { logger } from '../utils/logger';
import { Client, IntentsBitField, ThreadChannel } from 'discord.js';

// Hours to keep FULL/CLOSED threads before archiving
const FULL_THREAD_HOURS = parseFloat(process.env.LFG_FULL_THREAD_HOURS || '1.5');

// Hours to keep OPEN threads before archiving
const OPEN_THREAD_HOURS = parseFloat(process.env.LFG_OPEN_THREAD_HOURS || '24');

// Database connection wait time in milliseconds (30 seconds)
const DB_CONNECTION_TIMEOUT = 30000;

// Create a minimal Discord client with just the necessary intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages
  ]
});

/**
 * Wait for database connection to be established
 * @returns Promise that resolves when connected or rejects on timeout
 */
async function waitForDatabaseConnection(timeoutMs: number = DB_CONNECTION_TIMEOUT): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    // Set a timeout to reject if we wait too long
    const timeout = setTimeout(() => {
      reject(new Error(`Database connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Function to check database connection
    const checkConnection = async () => {
      if (!pgdb) {
        logger.warn('Database client not initialized yet, waiting...');
        setTimeout(checkConnection, 1000);
        return;
      }
      
      try {
        // Test with a simple query
        await pgdb.query('SELECT 1');
        clearTimeout(timeout);
        resolve(true);
      } catch (error) {
        logger.warn('Database not ready yet, retrying in 2 seconds...');
        setTimeout(checkConnection, 2000);
      }
    };
    
    // Start checking
    checkConnection();
  });
}

async function cleanupLfgThreads() {
  logger.info('==================================');
  logger.info('Starting LFG thread cleanup process');
  logger.info(`FULL/CLOSED thread retention: ${FULL_THREAD_HOURS} hours`);
  logger.info(`OPEN thread retention: ${OPEN_THREAD_HOURS} hours`);
  logger.info('==================================');

  if (!pgdb) {
    logger.error('Database client not available. Exiting.');
    process.exit(1);
  }

  // Wait for database connection before proceeding
  logger.info('Waiting for database connection...');
  try {
    await waitForDatabaseConnection();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    process.exit(1);
  }

  try {
    // Get sessions that need to be cleaned up
    const sessionsToCleanup = await pgdb.getLfgSessionsForCleanup(FULL_THREAD_HOURS, OPEN_THREAD_HOURS);
    logger.info(`Found ${sessionsToCleanup.length} LFG sessions to clean up`);

    if (sessionsToCleanup.length === 0) {
      logger.info('No LFG sessions to clean up. Exiting.');
      process.exit(0);
    }

    // Track success/failure counts
    let successCount = 0;
    let failureCount = 0;
    
    // Process each session
    for (const session of sessionsToCleanup) {
      logger.info(`Processing LFG session ${session.id} (${session.mission_name}), status: ${session.status}`);
      
      try {
        // Get the guild
        const guild = await client.guilds.fetch(session.guild_id).catch((error): null => {
          logger.error(`Error fetching guild ${session.guild_id}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });

        if (!guild) {
          logger.warn(`Guild ${session.guild_id} not found or bot not in guild, marking session as processed.`);
          // Update status rather than delete, to preserve history
          await pgdb.updateLfgSessionStatus(session.id, session.status === 'OPEN' ? 'CLOSED' : session.status);
          successCount++;
          continue;
        }

        // Get the thread
        const thread = await guild.channels.fetch(session.thread_id).catch((error): null => {
          logger.error(`Error fetching thread ${session.thread_id}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });

        if (!thread) {
          logger.warn(`Thread ${session.thread_id} not found, marking session as processed.`);
          // Update status rather than delete, to preserve history
          await pgdb.updateLfgSessionStatus(session.id, session.status === 'OPEN' ? 'CLOSED' : session.status);
          successCount++;
          continue;
        }

        if (!thread.isThread()) {
          logger.warn(`Channel ${session.thread_id} is not a thread, marking session as processed.`);
          // Update status rather than delete, to preserve history
          await pgdb.updateLfgSessionStatus(session.id, session.status === 'OPEN' ? 'CLOSED' : session.status);
          successCount++;
          continue;
        }

        const threadChannel = thread as ThreadChannel;

        // Check if already archived
        if (threadChannel.archived) {
          logger.info(`Thread ${session.thread_id} is already archived, marking session as processed.`);
          // Update status rather than delete, to preserve history
          await pgdb.updateLfgSessionStatus(session.id, session.status === 'OPEN' ? 'CLOSED' : session.status);
          successCount++;
          continue;
        }

        // Send a message before archiving
        await threadChannel.send({
          content: `This LFG thread is being automatically archived due to inactivity.`
        }).catch(error => {
          logger.error(`Error sending message to thread ${session.thread_id}: ${error instanceof Error ? error.message : String(error)}`);
        });

        // Archive the thread
        await threadChannel.setArchived(true, 'LFG auto-cleanup: Inactivity threshold reached').catch(error => {
          logger.error(`Error archiving thread ${session.thread_id}: ${error instanceof Error ? error.message : String(error)}`);
        });

        logger.info(`Successfully archived thread ${session.thread_id} for mission "${session.mission_name}"`);

        // Update status rather than delete, to preserve history
        await pgdb.updateLfgSessionStatus(session.id, session.status === 'OPEN' ? 'CLOSED' : session.status);
        logger.info(`Updated LFG session ${session.id} status to CLOSED`);
        successCount++;
      } catch (sessionError) {
        logger.error(`Error processing LFG session ${session.id}: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`);
        failureCount++;
      }
    }

    logger.info(`LFG thread cleanup completed with ${successCount} successes and ${failureCount} failures`);
    process.exit(failureCount > 0 ? 1 : 0);
  } catch (error) {
    logger.error('Error during LFG thread cleanup:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Login and start the cleanup process
client.login(config.BOT_TOKEN)
  .then(() => {
    logger.info('Bot logged in successfully');
    cleanupLfgThreads();
  })
  .catch(error => {
    logger.error('Error logging in:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }); 