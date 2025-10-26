/**
 * Script to clean up inactive warnings from the database
 * This can be run manually or scheduled as a cron job
 */

import { config } from '../config/config';
import { pgdb } from '../services/postgresDatabase';
import { logger } from '../utils/logger';

// Days to keep inactive warnings (default: 30 days)
const RETENTION_DAYS = parseInt(process.env.WARNING_RETENTION_DAYS || '30');

async function cleanupWarnings() {
  logger.info('==================================');
  logger.info('Starting warning cleanup process');
  logger.info(`Retention period: ${RETENTION_DAYS} days`);
  logger.info('==================================');

  if (!pgdb) {
    logger.error('Database connection not available. Exiting.');
    process.exit(1);
  }

  try {
    // Delete inactive warnings older than RETENTION_DAYS
    const count = await pgdb.deleteInactiveWarnings(RETENTION_DAYS);
    
    logger.info(`Cleanup complete: Deleted ${count} inactive warnings older than ${RETENTION_DAYS} days`);
    
    // Exit with success
    process.exit(0);
  } catch (error) {
    logger.error('Error during warning cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupWarnings().catch(error => {
  logger.error('Unhandled error during warning cleanup:', error);
  process.exit(1);
}); 