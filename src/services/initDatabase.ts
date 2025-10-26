import { config } from '../config/config';
import { logger } from '../utils/logger';
import { pgdb } from './postgresDatabase';

/**
 * Wait for database connection with timeout
 * @param maxWaitTimeMs Maximum time to wait for database connection in milliseconds
 * @param checkIntervalMs Interval between connection attempts in milliseconds
 */
async function waitForDatabaseConnection(maxWaitTimeMs: number = 60000, checkIntervalMs: number = 2000): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    attempts++;
    try {
      if (!pgdb) {
        throw new Error('PostgreSQL database client is null');
      }
      
      // Test connection with a simple query
      const connTest = await pgdb.query<{ now: Date }>('SELECT NOW() as now');
      const currentTime = connTest[0]?.now;
      logger.info(`Database connection successful after ${attempts} attempts! Server time: ${currentTime}`);
      return true;
    } catch (error) {
      // On first attempt, log as warning, after that log as debug to avoid log spam
      if (attempts === 1) {
        logger.warn(`Database connection attempt ${attempts} failed, will retry for up to ${maxWaitTimeMs/1000} seconds: ${error instanceof Error ? error.message : String(error)}`);
      } else if (attempts % 5 === 0) {
        // Log less frequently after initial attempts
        logger.debug(`Still waiting for database connection (attempt ${attempts}, elapsed ${(Date.now() - startTime)/1000}s): ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  }
  
  logger.critical(`Failed to connect to database after ${attempts} attempts (${maxWaitTimeMs/1000} seconds timeout)`);
  return false;
}

/**
 * Initialize the database tables and structure
 */
export async function initDatabase(): Promise<void> {
  logger.info('Initializing database...');

  // Only run initialization for PostgreSQL database
  if (config.DATABASE_TYPE !== 'postgres') {
    logger.info(`Skipping database initialization for ${config.DATABASE_TYPE} database`);
    return;
  }

  // Check if pgdb is null
  if (!pgdb) {
    logger.critical('PostgreSQL database client is null. Cannot initialize database.');
    throw new Error('PostgreSQL database client is null. Cannot initialize database.');
  }

  try {
    // Wait for database connection, giving it up to 60 seconds to connect
    // This leverages the reconnection logic in the database service
    logger.info('Waiting for database connection to be established...');
    const connected = await waitForDatabaseConnection(60000);
    
    if (!connected) {
      throw new Error('Timed out waiting for database connection. Check your database configuration and network.');
    }
    
    // Enable UUID extension if not already enabled
    logger.info('Enabling UUID extension...');
    await pgdb.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    logger.info('UUID extension enabled');

    // Creating database tables
    async function createTables() {
      // Create users table if it doesn't exist
      await pgdb.createTableIfNotExists(
        'users',
        `
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        global_name VARCHAR(255),
        avatar VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table users exists');
      
      // Create guilds table if it doesn't exist
      await pgdb.createTableIfNotExists(
        'guilds',
        `
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(255),
        owner_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table guilds exists');
      
      // Create guild settings table
      await pgdb.createTableIfNotExists(
        'guild_settings',
        `
        guild_id VARCHAR(255) PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
        prefix VARCHAR(10) DEFAULT '!',
        mod_role_id VARCHAR(255),
        admin_role_id VARCHAR(255),
        mute_role_id VARCHAR(255),
        log_channel_id VARCHAR(255),
        welcome_channel_id VARCHAR(255),
        welcome_message TEXT,
        farewell_message TEXT,
        lfg_channel_id VARCHAR(255),
        join_form_enabled BOOLEAN DEFAULT FALSE,
        join_form_channel_id VARCHAR(255),
        join_form_role_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table guild_settings exists');
      
      // Create user stats table
      await pgdb.createTableIfNotExists(
        'user_stats',
        `
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        messages_count INTEGER DEFAULT 0,
        commands_used INTEGER DEFAULT 0,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, guild_id)
        `
      );
      logger.info('Ensured table user_stats exists');
      
      // Create log settings table
      await pgdb.createTableIfNotExists(
        'log_settings',
        `
        guild_id VARCHAR(255) PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
        mod_commands BOOLEAN DEFAULT TRUE,
        voice_join BOOLEAN DEFAULT TRUE,
        voice_leave BOOLEAN DEFAULT TRUE,
        message_delete BOOLEAN DEFAULT TRUE,
        message_edit BOOLEAN DEFAULT TRUE,
        member_join BOOLEAN DEFAULT TRUE,
        member_leave BOOLEAN DEFAULT TRUE,
        ban_add BOOLEAN DEFAULT TRUE,
        ban_remove BOOLEAN DEFAULT TRUE,
        kick BOOLEAN DEFAULT TRUE,
        mute_add BOOLEAN DEFAULT TRUE,
        mute_remove BOOLEAN DEFAULT TRUE,
        warn_add BOOLEAN DEFAULT TRUE,
        warn_remove BOOLEAN DEFAULT TRUE,
        role_changes BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table log_settings exists');
      
      // Create command logs table
      await pgdb.createTableIfNotExists(
        'command_logs',
        `
        id SERIAL PRIMARY KEY,
        command_name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(255) REFERENCES guilds(id) ON DELETE CASCADE,
        channel_id VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        succeeded BOOLEAN NOT NULL DEFAULT TRUE,
        error_message TEXT
        `
      );
      logger.info('Ensured table command_logs exists');
      
      // Create warnings table
      try {
        await pgdb.createTableIfNotExists(
          'warnings',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id VARCHAR(255) NOT NULL,
          guild_id VARCHAR(255) NOT NULL,
          moderator_id VARCHAR(255) NOT NULL,
          reason TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          active BOOLEAN NOT NULL DEFAULT TRUE
          `
        );
        logger.info('Warnings table initialized');
      } catch (error) {
        logger.error('Error creating warnings table:', error);
      }
      
      // Create giveaways table
      try {
        await pgdb.createTableIfNotExists(
          'giveaways',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          message_id VARCHAR(255),
          creator_id VARCHAR(255) NOT NULL,
          prize TEXT NOT NULL,
          description TEXT,
          winners_count INTEGER NOT NULL DEFAULT 1,
          requirement TEXT,
          ends_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ended BOOLEAN NOT NULL DEFAULT FALSE
          `
        );
        
        // Create giveaway entries table for better scalability
        await pgdb.createTableIfNotExists(
          'giveaway_entries',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          giveaway_id UUID NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL,
          is_winner BOOLEAN NOT NULL DEFAULT FALSE,
          entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(giveaway_id, user_id)
          `
        );
        
        // Create index on giveaway_id for faster lookups
        await pgdb.query(`
          CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_id 
          ON giveaway_entries(giveaway_id)
        `);
        
        // Create index on user_id for faster user lookups
        await pgdb.query(`
          CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user_id 
          ON giveaway_entries(user_id)
        `);
        
        logger.info('Giveaways table initialized');
      } catch (error) {
        logger.error('Error creating giveaways table:', error);
      }
      
      // Create role reactions tables
      try {
        // Role reaction messages
        await pgdb.createTableIfNotExists(
          'role_reactions',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          message_id VARCHAR(255),
          creator_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(7) DEFAULT '#5865F2',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Role reaction buttons
        await pgdb.createTableIfNotExists(
          'role_reaction_buttons',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          role_reaction_id UUID NOT NULL REFERENCES role_reactions(id) ON DELETE CASCADE,
          role_id VARCHAR(255) NOT NULL,
          emoji VARCHAR(255),
          label VARCHAR(255),
          position INTEGER NOT NULL DEFAULT 0,
          style INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Custom embeds table
        await pgdb.createTableIfNotExists(
          'custom_embeds',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          creator_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          title VARCHAR(255),
          description TEXT,
          color VARCHAR(7) DEFAULT '#5865F2',
          thumbnail VARCHAR(255),
          image VARCHAR(255),
          footer TEXT,
          timestamp BOOLEAN DEFAULT false,
          author_name VARCHAR(255),
          author_icon_url VARCHAR(255),
          author_url VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(guild_id, name)
          `
        );
        
        // Custom embed fields table
        await pgdb.createTableIfNotExists(
          'custom_embed_fields',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          embed_id UUID NOT NULL REFERENCES custom_embeds(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          value TEXT NOT NULL,
          inline BOOLEAN DEFAULT false,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        logger.info('Custom embeds tables initialized');
      } catch (error) {
        logger.error('Error creating role reactions tables:', error);
      }

      // Warframe catalog table
      try {
        await pgdb.createTableIfNotExists(
          'warframe_catalog',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          crafting_cost INTEGER,
          resources JSONB NOT NULL DEFAULT '{}'::JSONB,
          updated_by VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        await pgdb.query(`CREATE INDEX IF NOT EXISTS idx_warframe_catalog_name ON warframe_catalog(name)`);
        logger.info('Ensured warframe_catalog exists');
      } catch (error) {
        logger.error('Error creating warframe_catalog table:', error);
      }
      
      // Create Warframe notification tables
      try {
        // Fissure notifications table
        await pgdb.createTableIfNotExists(
          'fissure_notifications',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          mission_type VARCHAR(255) NOT NULL,
          steel_path BOOLEAN DEFAULT false,
          role_id VARCHAR(255),
          last_notified VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Aya notifications table
        await pgdb.createTableIfNotExists(
          'aya_notifications',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          role_id VARCHAR(255),
          message_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Baro notifications table
        await pgdb.createTableIfNotExists(
          'baro_notifications',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          role_id VARCHAR(255),
          message_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Arbitration notifications table
        await pgdb.createTableIfNotExists(
          'arbitration_notifications',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          role_id VARCHAR(255),
          message_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        // Incarnon notifications table
        await pgdb.createTableIfNotExists(
          'incarnon_notifications',
          `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          role_id VARCHAR(255),
          message_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          `
        );
        
        logger.info('Warframe notification tables initialized');
      } catch (error) {
        logger.error('Error creating Warframe notification tables:', error);
      }
      
      // Create guild permission roles table
      await pgdb.createTableIfNotExists(
        'guild_permission_roles',
        `
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        roles JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT guild_permission_roles_guild_id_unique UNIQUE (guild_id)
        `
      );
      logger.info('Ensured table guild_permission_roles exists');
      
      // Create join forms table
      await pgdb.createTableIfNotExists(
        'join_forms',
        `
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR(255) NOT NULL,
        form_data JSONB NOT NULL DEFAULT '{}'::JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table join_forms exists');
      
      // Create join form configuration table
      await pgdb.createTableIfNotExists(
        'join_form_config',
        `
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL UNIQUE,
        enabled BOOLEAN DEFAULT FALSE,
        button_channel_id VARCHAR(255),
        button_message_id VARCHAR(255),
        notification_channel_id VARCHAR(255),
        approved_role_id VARCHAR(255),
        form_fields JSONB NOT NULL DEFAULT '{}'::JSONB,
        welcome_message TEXT,
        button_text VARCHAR(255) DEFAULT 'Complete Join Form',
        button_emoji VARCHAR(255) DEFAULT '📋',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        `
      );
      logger.info('Ensured table join_form_config exists');
      
      // Verify all expected tables exist
      logger.info('Verifying all tables...');
      const tables = ['users', 'guilds', 'guild_settings', 'user_stats', 'command_logs', 'warnings'];
      const tableCheck = await pgdb.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [tables]
      );
      
      const foundTables = tableCheck.map((row: { table_name: string }) => row.table_name);
      const missingTables = tables.filter(table => !foundTables.includes(table));
      
      if (missingTables.length > 0) {
        logger.warn('Some tables were not created properly:', missingTables);
      } else {
        logger.info('All database tables verified successfully');
      }
    }

    // Run all initialization functions
    await createTables();

    logger.info('Database initialization complete');
  } catch (error) {
    logger.critical('Error initializing database:', error);
    throw new Error('Database initialization failed. Bot may not function correctly.');
  }
} 