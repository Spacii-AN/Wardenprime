import fs from 'fs';
import path from 'path';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

async function runMigration() {
  try {
    logger.info('Running database migrations...');
    
    // Get the migration SQL file
    const migrationFilePath = path.join(__dirname, 'migrations', 'add_lfg_channel.sql');
    
    // Read the SQL file
    const migrationSQL = fs.readFileSync(migrationFilePath, 'utf8');
    
    // Run the SQL
    await pgdb.query(migrationSQL);
    
    logger.info('Successfully added lfg_channel_id column to guild_settings table');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration(); 