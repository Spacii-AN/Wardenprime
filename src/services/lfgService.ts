import { Client, TextChannel } from 'discord.js';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

// Interface for the LFG thread data from database
interface LfgThread {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  thread_id: string;
  host_user_id: string;
  content: string;
  current_members: number;
  max_members: number;
  status: 'OPEN' | 'CLOSED' | 'FULL';
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

// Interface for PostgreSQL query results
interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Time constants
const ARCHIVE_DELAY_MS = 90 * 60 * 1000; // 1.5 hours in milliseconds
const INACTIVE_THREAD_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour

/**
 * LFG Service for managing and cleaning up LFG threads
 */
export class LfgService {
  private client: Client;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Start the cleanup job to run at regular intervals
   */
  public startCleanupJob(): void {
    // Run immediately on startup
    this.cleanupLfgThreads();
    
    // Then set up regular interval
    this.cleanupInterval = setInterval(() => this.cleanupLfgThreads(), CLEANUP_INTERVAL_MS);
    
    logger.info('LFG cleanup job started, will run every hour');
  }

  /**
   * Stop the cleanup job
   */
  public stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('LFG cleanup job stopped');
    }
  }

  /**
   * Main cleanup function to handle:
   * 1. Archiving closed threads after grace period
   * 2. Closing inactive threads after 24 hours
   * 3. Removing db entries for archived threads
   */
  private async cleanupLfgThreads(): Promise<void> {
    try {
      logger.info('Running LFG thread cleanup job');
      
      await this.cleanupClosedThreads();
      await this.cleanupInactiveThreads();
      
      logger.info('LFG thread cleanup job completed');
    } catch (error) {
      logger.error(`Error in LFG cleanup job: ${error}`);
    }
  }

  /**
   * Clean up threads marked as CLOSED in the database
   */
  private async cleanupClosedThreads(): Promise<void> {
    try {
      // 1. Get all CLOSED threads
      const query = 'SELECT * FROM lfg_threads WHERE status = $1';
      const result = await pgdb.query<LfgThread>(query, ['CLOSED']) as unknown as QueryResult<LfgThread>;
      const closedThreads = result.rows;
      
      logger.info(`Found ${closedThreads.length} closed LFG threads to process`);
      
      // 2. Archive and delete any closed threads that are past the 1.5 hour grace period
      for (const thread of closedThreads) {
        const closedTime = thread.closed_at ? new Date(thread.closed_at) : new Date(thread.updated_at);
        const archiveTime = new Date(closedTime.getTime() + ARCHIVE_DELAY_MS);
        
        if (new Date() > archiveTime) {
          try {
            const guild = await this.client.guilds.fetch(thread.guild_id);
            if (!guild) {
              logger.warn(`Could not find guild ${thread.guild_id}, will remove thread record ${thread.id}`);
              await this.deleteThreadRecord(thread.id);
              continue;
            }
            
            // Try to get the thread channel
            try {
              const threadChannel = await guild.channels.fetch(thread.thread_id);
              
              if (threadChannel && threadChannel.isThread()) {
                // Archive the thread if it's not already archived
                if (!threadChannel.archived) {
                  await threadChannel.setArchived(true);
                  logger.info(`Archived LFG thread ${thread.thread_id} in guild ${thread.guild_id}`);
                }
              }
            } catch (channelError) {
              logger.warn(`Could not find or access thread ${thread.thread_id}, will remove record: ${channelError}`);
            }
            
            // Delete from database regardless of whether we could archive the thread
            // This handles cases where the thread was already deleted in Discord
            await this.deleteThreadRecord(thread.id);
            logger.info(`Deleted LFG thread record ${thread.id} from database`);
          } catch (error) {
            logger.error(`Error processing closed thread ${thread.id}: ${error}`);
            
            // If we can't find the guild or there's some other error,
            // still remove the DB entry to prevent endless processing
            await this.deleteThreadRecord(thread.id);
          }
        } else {
          const timeRemaining = archiveTime.getTime() - Date.now();
          logger.debug(`Thread ${thread.id} will be archived in ${Math.floor(timeRemaining / 60000)} minutes`);
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up closed LFG threads: ${error}`);
    }
  }

  /**
   * Clean up OPEN threads that have been inactive for 24+ hours
   */
  private async cleanupInactiveThreads(): Promise<void> {
    try {
      // Get all OPEN threads
      const query = 'SELECT * FROM lfg_threads WHERE status = $1';
      const result = await pgdb.query<LfgThread>(query, ['OPEN']) as unknown as QueryResult<LfgThread>;
      const openThreads = result.rows;
      
      logger.info(`Found ${openThreads.length} open LFG threads to check for inactivity`);
      
      // Check each open thread for inactivity
      for (const thread of openThreads) {
        const createdTime = new Date(thread.created_at);
        const inactiveTime = new Date(createdTime.getTime() + INACTIVE_THREAD_TIMEOUT_MS);
        
        if (new Date() > inactiveTime) {
          try {
            const guild = await this.client.guilds.fetch(thread.guild_id);
            if (!guild) {
              logger.warn(`Could not find guild ${thread.guild_id} for inactive thread ${thread.id}, removing record`);
              await this.deleteThreadRecord(thread.id);
              continue;
            }
            
            try {
              const threadChannel = await guild.channels.fetch(thread.thread_id);
              
              if (threadChannel && threadChannel.isThread()) {
                // Send inactivity notification message
                await threadChannel.send({
                  content: `This LFG has been automatically closed due to 24 hours of inactivity.`
                });
                
                // Update status in database before archiving
                await this.markThreadAsClosed(thread.id);
                
                // Archive the thread
                await threadChannel.setArchived(true);
                logger.info(`Auto-closed inactive LFG thread ${thread.thread_id} in guild ${thread.guild_id}`);
              }
            } catch (channelError) {
              logger.warn(`Could not find thread channel ${thread.thread_id} for inactive thread: ${channelError}`);
              await this.deleteThreadRecord(thread.id);
            }
          } catch (error) {
            logger.error(`Error processing inactive thread ${thread.id}: ${error}`);
            await this.deleteThreadRecord(thread.id);
          }
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up inactive LFG threads: ${error}`);
    }
  }

  /**
   * Delete a thread record from the database
   */
  private async deleteThreadRecord(id: string): Promise<void> {
    try {
      await pgdb.query('DELETE FROM lfg_threads WHERE id = $1', [id]);
    } catch (error) {
      logger.error(`Failed to delete LFG thread record ${id}: ${error}`);
    }
  }

  /**
   * Mark a thread as closed in the database
   */
  private async markThreadAsClosed(id: string): Promise<void> {
    try {
      await pgdb.query(
        'UPDATE lfg_threads SET status = $1, closed_at = $2 WHERE id = $3',
        ['CLOSED', new Date(), id]
      );
    } catch (error) {
      logger.error(`Failed to mark LFG thread ${id} as closed: ${error}`);
    }
  }
}

// Global LFG service instance
let lfgService: LfgService | null = null;

/**
 * Initialize the LFG service
 */
export function initLfgService(client: Client): void {
  lfgService = new LfgService(client);
  lfgService.startCleanupJob();
}

/**
 * Get the LFG service instance
 */
export function getLfgService(): LfgService | null {
  return lfgService;
} 