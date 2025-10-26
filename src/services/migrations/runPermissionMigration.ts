/**
 * Script to create the guild_permission_roles table and migrate data
 * from JSON to PostgreSQL
 */
import fs from 'fs';
import path from 'path';
import { pgdb } from '../postgresDatabase';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

// Define types for query results
interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Path to the SQL migration file
const sqlMigrationPath = path.join(__dirname, 'create_permission_roles_table.sql');

/**
 * Run the permission roles migration
 */
async function runPermissionMigration(): Promise<void> {
  logger.info('Starting permission roles migration');
  
  try {
    // 1. First check if the table already exists
    const tableExists = await pgdb.query<{exists: boolean}>(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'guild_permission_roles') as exists"
    ) as unknown as QueryResult<{exists: boolean}>;
    
    if (tableExists.rows[0]?.exists) {
      logger.info('guild_permission_roles table already exists, skipping creation');
    } else {
      // 2. Create the table using the SQL file
      logger.info('Creating guild_permission_roles table from SQL file');
      const sqlContent = fs.readFileSync(sqlMigrationPath, 'utf8');
      await pgdb.query(sqlContent);
      logger.info('Successfully created guild_permission_roles table');
    }
    
    // 3. Check if we need to migrate data
    logger.info('Checking if JSON data migration is needed...');
    
    // Path to the JSON permission data
    const jsonFilePath = path.join(process.cwd(), 'data', 'guildPermissions.json');
    
    if (!fs.existsSync(jsonFilePath)) {
      logger.info('No JSON file found, skipping data migration');
      return;
    }
    
    // 4. Read JSON data
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    logger.info(`Found ${jsonData.length} permission entries in JSON file`);
    
    // 5. Check if we already have migrated the data
    const countResult = await pgdb.query<{count: string}>(
      'SELECT COUNT(*) as count FROM guild_permission_roles'
    ) as unknown as QueryResult<{count: string}>;
    
    const existingCount = parseInt(countResult.rows[0].count);
    
    if (existingCount > 0) {
      logger.info(`Found ${existingCount} existing entries in PostgreSQL, checking for updates...`);
    }
    
    // 6. Migrate the data
    let insertCount = 0;
    let updateCount = 0;
    
    // Begin transaction
    await pgdb.query('BEGIN');
    
    try {
      // Process each permission entry
      for (const entry of jsonData) {
        const { guildId, roles, updatedAt } = entry;
        
        // Check if guild exists first (foreign key constraint)
        const guildExists = await pgdb.query<{exists: boolean}>(
          'SELECT EXISTS(SELECT 1 FROM guilds WHERE id = $1) as exists',
          [guildId]
        ) as unknown as QueryResult<{exists: boolean}>;
        
        if (!guildExists.rows[0]?.exists) {
          // Need to create a minimal guild entry since we have a foreign key constraint
          logger.warn(`Guild ${guildId} doesn't exist in database. Creating minimal entry.`);
          await pgdb.query(
            'INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)',
            [guildId, `Unknown Guild (${guildId})`, '0']
          );
        }
        
        // Check if entry already exists
        const existingEntry = await pgdb.query(
          'SELECT guild_id FROM guild_permission_roles WHERE guild_id = $1',
          [guildId]
        ) as unknown as QueryResult<{guild_id: string}>;
        
        if (existingEntry.rows.length > 0) {
          // Update existing entry
          await pgdb.query(
            'UPDATE guild_permission_roles SET roles = $1, updated_at = $2 WHERE guild_id = $3',
            [roles, new Date(updatedAt), guildId]
          );
          updateCount++;
        } else {
          // Insert new entry
          await pgdb.query(
            'INSERT INTO guild_permission_roles (guild_id, roles, created_at, updated_at) VALUES ($1, $2, $3, $3)',
            [guildId, roles, new Date(updatedAt)]
          );
          insertCount++;
        }
      }
      
      // Commit transaction
      await pgdb.query('COMMIT');
      
      logger.info('Migration completed successfully:');
      logger.info(`- Inserted ${insertCount} new permission entries`);
      logger.info(`- Updated ${updateCount} existing permission entries`);
      
      // Create backup of the JSON file
      const backupPath = `${jsonFilePath}.bak.${Date.now()}`;
      fs.copyFileSync(jsonFilePath, backupPath);
      logger.info(`Created backup of JSON file at ${backupPath}`);
      
    } catch (error) {
      // Rollback in case of error
      await pgdb.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    logger.error('Error during permission roles migration:', error);
    throw error;
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  logger.info('Running permission roles migration script...');
  runPermissionMigration()
    .then(() => {
      logger.info('Permission roles migration script completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Permission roles migration script failed:', error);
      process.exit(1);
    });
} else {
  // Export for importing in other files
  module.exports = { runPermissionMigration };
} 