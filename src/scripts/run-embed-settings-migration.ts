#!/usr/bin/env ts-node

/**
 * Migration script for embed settings
 * This script runs the embed settings database migration
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config/config';
import { pgdb } from '../services/postgresDatabase';
import { logger } from '../utils/logger';

async function runEmbedSettingsMigration() {
  try {
    logger.info('Starting embed settings migration...');
    
    if (!pgdb) {
      throw new Error('Database not available');
    }

    // Read the migration SQL file
    const migrationPath = join(__dirname, '../services/migrations/embed_settings.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    logger.info(`Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          logger.info(`Executing statement ${i + 1}/${statements.length}...`);
          await pgdb.query(statement);
          logger.info(`✅ Statement ${i + 1} executed successfully`);
        } catch (error) {
          logger.error(`❌ Error executing statement ${i + 1}:`, error);
          logger.error(`Statement: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }

    logger.info('✅ Embed settings migration completed successfully!');
    
    // Test the migration by checking if the table exists and has data
    const testResult = await pgdb.query('SELECT COUNT(*) as count FROM embed_settings WHERE guild_id = $1', ['global']);
    const globalSettingsCount = testResult[0]?.count || 0;
    
    logger.info(`✅ Migration verified: ${globalSettingsCount} global settings created`);
    
  } catch (error) {
    logger.error('❌ Embed settings migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runEmbedSettingsMigration()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { runEmbedSettingsMigration };
