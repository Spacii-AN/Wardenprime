/**
 * Migration script to move permission roles from JSON file to PostgreSQL database
 * 
 * Usage: 
 * 1. Make sure .env file is set up with correct database credentials
 * 2. Run with: node src/services/migrations/migrate_json_permissions.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create PostgreSQL connection
const pool = new Pool({
  host: process.env.PG_HOST || 'discordpersonal-do-user-18514065-0.k.db.ondigitalocean.com',
  port: parseInt(process.env.PG_PORT || '25060'),
  database: process.env.PG_DATABASE || 'defaultdb',
  user: process.env.PG_USER || 'doadmin',
  password: process.env.PG_PASSWORD || 'password',
  ssl: process.env.PG_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false
});

// Path to the JSON permission data
const jsonFilePath = path.join(process.cwd(), 'data', 'guildPermissions.json');

async function migrate() {
  console.log('Starting migration of permission roles from JSON to PostgreSQL...');
  
  // Check if the JSON file exists
  if (!fs.existsSync(jsonFilePath)) {
    console.log(`No JSON file found at ${jsonFilePath}, nothing to migrate.`);
    return;
  }
  
  // Read JSON data
  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    console.log(`Read ${jsonData.length} permission entries from JSON file.`);
  } catch (error) {
    console.error('Error reading JSON file:', error);
    return;
  }
  
  // Start a client from the pool
  const client = await pool.connect();
  
  try {
    // Begin transaction
    await client.query('BEGIN');
    
    // Ensure the table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_permission_roles (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        roles JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT guild_permission_roles_guild_id_unique UNIQUE (guild_id)
      )
    `);
    
    // Check if we already have data in the PostgreSQL table
    const { rows } = await client.query('SELECT COUNT(*) FROM guild_permission_roles');
    const count = parseInt(rows[0].count);
    
    if (count > 0) {
      console.log(`Found ${count} existing entries in PostgreSQL, checking for updates...`);
    }
    
    // Prepare the migration
    let insertCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    
    // Process each permission entry
    for (const entry of jsonData) {
      const { guildId, roles, updatedAt } = entry;
      
      // Check if entry already exists in PostgreSQL
      const existingEntry = await client.query(
        'SELECT guild_id FROM guild_permission_roles WHERE guild_id = $1',
        [guildId]
      );
      
      if (existingEntry.rows.length > 0) {
        // Update existing entry
        await client.query(
          'UPDATE guild_permission_roles SET roles = $1, updated_at = $2 WHERE guild_id = $3',
          [roles, new Date(updatedAt), guildId]
        );
        updateCount++;
      } else {
        // Insert new entry
        await client.query(
          'INSERT INTO guild_permission_roles (guild_id, roles, created_at, updated_at) VALUES ($1, $2, $3, $3)',
          [guildId, roles, new Date(updatedAt)]
        );
        insertCount++;
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log(`Migration completed successfully:`);
    console.log(`- Inserted ${insertCount} new permission entries`);
    console.log(`- Updated ${updateCount} existing permission entries`);
    console.log(`- Skipped ${skipCount} entries`);
    
    // Create backup of the JSON file
    const backupPath = `${jsonFilePath}.bak.${Date.now()}`;
    fs.copyFileSync(jsonFilePath, backupPath);
    console.log(`Created backup of JSON file at ${backupPath}`);
    
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Error during migration:', error);
  } finally {
    // Release client back to pool
    client.release();
    pool.end();
  }
}

// Run the migration
migrate().catch(console.error); 