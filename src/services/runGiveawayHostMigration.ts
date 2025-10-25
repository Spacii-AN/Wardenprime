import fs from 'fs';
import path from 'path';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

async function runGiveawayHostMigration() {
  try {
    logger.info('Running giveaway host migration...');
    
    // Get the migration SQL file
    const migrationFilePath = path.join(__dirname, 'migrations', 'add_giveaway_host.sql');
    
    // Read the SQL file
    const migrationSQL = fs.readFileSync(migrationFilePath, 'utf8');
    
    // Run the SQL
    await pgdb.query(migrationSQL);
    
    logger.info('Successfully added host_id column to giveaways table');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('Giveaway host migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runGiveawayHostMigration();
