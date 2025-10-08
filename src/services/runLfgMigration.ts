import fs from 'fs';
import path from 'path';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

async function runLfgMigration() {
  try {
    logger.info('Running LFG database migration...');
    
    // Get the migration SQL file
    const migrationFilePath = path.join(__dirname, 'migrations', 'add_lfg_tables.sql');
    
    // Read the SQL file
    const migrationSQL = fs.readFileSync(migrationFilePath, 'utf8');
    
    // Run the SQL
    await pgdb.query(migrationSQL);
    
    logger.info('Successfully created LFG tables');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('LFG migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runLfgMigration(); 