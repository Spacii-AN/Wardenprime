import { config } from '../config/config';
import { db as jsonDb } from './database';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

/**
 * Database factory to get the appropriate database implementation based on configuration
 */
class DatabaseFactory {
  /**
   * Get the database instance based on configuration
   */
  public static getDatabase() {
    logger.info(`Using ${config.DATABASE_TYPE} database`);
    
    switch (config.DATABASE_TYPE) {
      case 'postgres':
        return pgdb;
      case 'json':
        return jsonDb;
      default:
        logger.warn(`Unknown database type: ${config.DATABASE_TYPE}, falling back to JSON database`);
        return jsonDb;
    }
  }
}

// Export the database instance
export const database = DatabaseFactory.getDatabase(); 