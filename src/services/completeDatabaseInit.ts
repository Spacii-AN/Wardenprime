import { config } from '../config/config';
import { logger } from '../utils/logger';
import { pgdb } from './postgresDatabase';

/**
 * Complete database initialization script
 * This creates ALL tables, columns, indexes, and default data in one go
 * No more running migrations every time!
 */

/**
 * Wait for database connection with timeout
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
      
      const connTest = await pgdb.query<{ now: Date }>('SELECT NOW() as now');
      const currentTime = connTest[0]?.now;
      logger.info(`Database connection successful after ${attempts} attempts! Server time: ${currentTime}`);
      return true;
    } catch (error) {
      if (attempts === 1) {
        logger.warn(`Database connection attempt ${attempts} failed, will retry for up to ${maxWaitTimeMs/1000} seconds: ${error instanceof Error ? error.message : String(error)}`);
      } else if (attempts % 5 === 0) {
        logger.debug(`Still waiting for database connection (attempt ${attempts}, elapsed ${(Date.now() - startTime)/1000}s): ${error instanceof Error ? error.message : String(error)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  }
  
  logger.critical(`Failed to connect to database after ${attempts} attempts (${maxWaitTimeMs/1000} seconds timeout)`);
  return false;
}

/**
 * Complete database initialization with ALL tables, columns, and data
 */
async function completeDatabaseInit(): Promise<void> {
  logger.info('🚀 Starting COMPLETE database initialization...');

  if (config.DATABASE_TYPE !== 'postgres') {
    logger.info(`Skipping database initialization for ${config.DATABASE_TYPE} database`);
    return;
  }

  if (!pgdb) {
    logger.critical('PostgreSQL database client is null. Cannot initialize database.');
    throw new Error('PostgreSQL database client is null. Cannot initialize database.');
  }

  try {
    // Wait for database connection
    logger.info('Waiting for database connection...');
    const connected = await waitForDatabaseConnection(60000);
    
    if (!connected) {
      throw new Error('Timed out waiting for database connection. Check your database configuration and network.');
    }
    
    // Enable UUID extension
    logger.info('Enabling UUID extension...');
    await pgdb.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    logger.info('✅ UUID extension enabled');

    // Drop and recreate all tables to ensure clean state
    logger.info('🧹 Dropping existing tables for clean initialization...');
    const dropTables = [
      'custom_embed_fields', 'custom_embeds', 'role_reaction_buttons', 'role_reactions',
      'giveaway_entries', 'giveaways', 'embed_settings', 'warnings', 'command_logs',
      'log_settings', 'user_stats', 'guild_settings', 'guild_permission_roles',
      'join_forms', 'join_form_config', 'guilds', 'users', 'warframe_catalog',
      'fissure_notifications', 'aya_notifications', 'baro_notifications', 
      'arbitration_notifications', 'incarnon_notifications'
    ];

    for (const table of dropTables) {
      try {
        await pgdb.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      } catch (error) {
        logger.debug(`Table ${table} may not exist, continuing...`);
      }
    }
    logger.info('✅ All existing tables dropped');

    // Create all tables with complete schema
    logger.info('📋 Creating all tables with complete schema...');

    // 1. Users table
    await pgdb.query(`
      CREATE TABLE users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        global_name VARCHAR(255),
        avatar VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Users table created');

    // 2. Guilds table
    await pgdb.query(`
      CREATE TABLE guilds (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(255),
        owner_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Guilds table created');

    // 3. Guild settings table
    await pgdb.query(`
      CREATE TABLE guild_settings (
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
      )
    `);
    logger.info('✅ Guild settings table created');

    // 4. User stats table
    await pgdb.query(`
      CREATE TABLE user_stats (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        messages_count INTEGER DEFAULT 0,
        commands_used INTEGER DEFAULT 0,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, guild_id)
      )
    `);
    logger.info('✅ User stats table created');

    // 5. Log settings table
    await pgdb.query(`
      CREATE TABLE log_settings (
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
      )
    `);
    logger.info('✅ Log settings table created');

    // 6. Command logs table
    await pgdb.query(`
      CREATE TABLE command_logs (
        id SERIAL PRIMARY KEY,
        command_name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(255) REFERENCES guilds(id) ON DELETE CASCADE,
        channel_id VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        succeeded BOOLEAN NOT NULL DEFAULT TRUE,
        error_message TEXT
      )
    `);
    logger.info('✅ Command logs table created');

    // 7. Warnings table
    await pgdb.query(`
      CREATE TABLE warnings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255) NOT NULL,
        moderator_id VARCHAR(255) NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
    logger.info('✅ Warnings table created');

    // 8. Giveaways table (WITH host_id column)
    await pgdb.query(`
      CREATE TABLE giveaways (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        message_id VARCHAR(255),
        creator_id VARCHAR(255) NOT NULL,
        host_id VARCHAR(255),
        prize TEXT NOT NULL,
        description TEXT,
        winners_count INTEGER NOT NULL DEFAULT 1,
        requirement TEXT,
        ends_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    logger.info('✅ Giveaways table created (with host_id column)');

    // 9. Giveaway entries table
    await pgdb.query(`
      CREATE TABLE giveaway_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        giveaway_id UUID NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        is_winner BOOLEAN NOT NULL DEFAULT FALSE,
        entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(giveaway_id, user_id)
      )
    `);
    logger.info('✅ Giveaway entries table created');

    // 10. Role reactions table
    await pgdb.query(`
      CREATE TABLE role_reactions (
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
      )
    `);
    logger.info('✅ Role reactions table created');

    // 11. Role reaction buttons table
    await pgdb.query(`
      CREATE TABLE role_reaction_buttons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        role_reaction_id UUID NOT NULL REFERENCES role_reactions(id) ON DELETE CASCADE,
        role_id VARCHAR(255) NOT NULL,
        emoji VARCHAR(255),
        label VARCHAR(255),
        position INTEGER NOT NULL DEFAULT 0,
        style INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Role reaction buttons table created');

    // 12. Custom embeds table
    await pgdb.query(`
      CREATE TABLE custom_embeds (
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
      )
    `);
    logger.info('✅ Custom embeds table created');

    // 13. Custom embed fields table
    await pgdb.query(`
      CREATE TABLE custom_embed_fields (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        embed_id UUID NOT NULL REFERENCES custom_embeds(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        value TEXT NOT NULL,
        inline BOOLEAN DEFAULT false,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Custom embed fields table created');

    // 14. Warframe catalog table
    await pgdb.query(`
      CREATE TABLE warframe_catalog (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        crafting_cost INTEGER,
        resources JSONB NOT NULL DEFAULT '{}'::JSONB,
        updated_by VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Warframe catalog table created');

    // 15. Fissure notifications table
    await pgdb.query(`
      CREATE TABLE fissure_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        mission_type VARCHAR(255) NOT NULL,
        steel_path BOOLEAN DEFAULT false,
        role_id VARCHAR(255),
        last_notified VARCHAR(255),
        node_name VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Fissure notifications table created');

    // 16. Aya notifications table
    await pgdb.query(`
      CREATE TABLE aya_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        role_id VARCHAR(255),
        message_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Aya notifications table created');

    // 17. Baro notifications table
    await pgdb.query(`
      CREATE TABLE baro_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        role_id VARCHAR(255),
        message_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Baro notifications table created');

    // 18. Arbitration notifications table
    await pgdb.query(`
      CREATE TABLE arbitration_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        role_id VARCHAR(255),
        message_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Arbitration notifications table created');

    // 19. Incarnon notifications table
    await pgdb.query(`
      CREATE TABLE incarnon_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        role_id VARCHAR(255),
        message_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('✅ Incarnon notifications table created');

    // 20. Guild permission roles table
    await pgdb.query(`
      CREATE TABLE guild_permission_roles (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        roles JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT guild_permission_roles_guild_id_unique UNIQUE (guild_id)
      )
    `);
    logger.info('✅ Guild permission roles table created');

    // 21. Join forms table
    await pgdb.query(`
      CREATE TABLE join_forms (
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
      )
    `);
    logger.info('✅ Join forms table created');

    // 22. Join form configuration table
    await pgdb.query(`
      CREATE TABLE join_form_config (
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
      )
    `);
    logger.info('✅ Join form configuration table created');

    // 23. Embed settings table (the missing one!)
    await pgdb.query(`
      CREATE TABLE embed_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guild_id VARCHAR(20) NOT NULL,
        setting_name VARCHAR(50) NOT NULL,
        setting_value TEXT NOT NULL,
        setting_type VARCHAR(20) NOT NULL DEFAULT 'string',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(guild_id, setting_name)
      )
    `);
    logger.info('✅ Embed settings table created');

    // Create all indexes for performance
    logger.info('🔍 Creating performance indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_id ON giveaway_entries(giveaway_id)',
      'CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user_id ON giveaway_entries(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_giveaways_host_id ON giveaways(host_id)',
      'CREATE INDEX IF NOT EXISTS idx_warframe_catalog_name ON warframe_catalog(name)',
      'CREATE INDEX IF NOT EXISTS idx_embed_settings_guild_id ON embed_settings(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_embed_settings_name ON embed_settings(setting_name)',
      'CREATE INDEX IF NOT EXISTS idx_custom_embeds_guild_id ON custom_embeds(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_custom_embeds_name ON custom_embeds(name)',
      'CREATE INDEX IF NOT EXISTS idx_role_reactions_guild_id ON role_reactions(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_fissure_notifications_guild_id ON fissure_notifications(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_aya_notifications_guild_id ON aya_notifications(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_baro_notifications_guild_id ON baro_notifications(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_arbitration_notifications_guild_id ON arbitration_notifications(guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_incarnon_notifications_guild_id ON incarnon_notifications(guild_id)'
    ];

    for (const indexQuery of indexes) {
      await pgdb.query(indexQuery);
    }
    logger.info('✅ All performance indexes created');

    // Insert default embed settings
    logger.info('🎨 Inserting default embed settings...');
    await pgdb.query(`
      INSERT INTO embed_settings (guild_id, setting_name, setting_value, setting_type, description) VALUES
      ('global', 'primary_color', '#5865F2', 'color', 'Primary embed color (Discord Blurple)'),
      ('global', 'success_color', '#57F287', 'color', 'Success embed color (Green)'),
      ('global', 'error_color', '#ED4245', 'color', 'Error embed color (Red)'),
      ('global', 'warning_color', '#FEE75C', 'color', 'Warning embed color (Yellow)'),
      ('global', 'info_color', '#5865F2', 'color', 'Info embed color (Discord Blurple)'),
      ('global', 'default_footer', 'Powered by WardenPrime', 'string', 'Default footer text for embeds'),
      ('global', 'default_author_name', 'WardenPrime', 'string', 'Default author name for embeds'),
      ('global', 'default_author_icon', 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png', 'string', 'Default author icon URL'),
      ('global', 'default_author_url', '', 'string', 'Default author URL (optional)'),
      ('global', 'show_timestamp', 'true', 'boolean', 'Whether to show timestamp by default'),
      ('global', 'show_author', 'true', 'boolean', 'Whether to show author by default')
      ON CONFLICT (guild_id, setting_name) DO NOTHING
    `);
    logger.info('✅ Default embed settings inserted');

    // Create PostgreSQL functions
    logger.info('⚙️ Creating PostgreSQL functions...');
    
    // Function to get embed settings with fallback
    await pgdb.query(`
      CREATE OR REPLACE FUNCTION get_embed_setting(
        p_guild_id VARCHAR(20),
        p_setting_name VARCHAR(50)
      ) RETURNS TEXT AS $$
      DECLARE
        result TEXT;
      BEGIN
        -- First try to get guild-specific setting
        SELECT setting_value INTO result
        FROM embed_settings
        WHERE guild_id = p_guild_id AND setting_name = p_setting_name;
        
        -- If not found, try global default
        IF result IS NULL THEN
          SELECT setting_value INTO result
          FROM embed_settings
          WHERE guild_id = 'global' AND setting_name = p_setting_name;
        END IF;
        
        RETURN result;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Function to get all embed settings for a guild
    await pgdb.query(`
      CREATE OR REPLACE FUNCTION get_all_embed_settings(p_guild_id VARCHAR(20))
      RETURNS TABLE(setting_name VARCHAR(50), setting_value TEXT, setting_type VARCHAR(20)) AS $$
      BEGIN
        RETURN QUERY
        WITH guild_settings AS (
          SELECT setting_name, setting_value, setting_type
          FROM embed_settings
          WHERE guild_id = p_guild_id
        ),
        global_settings AS (
          SELECT setting_name, setting_value, setting_type
          FROM embed_settings
          WHERE guild_id = 'global'
        )
        SELECT 
          COALESCE(gs.setting_name, gls.setting_name) as setting_name,
          COALESCE(gs.setting_value, gls.setting_value) as setting_value,
          COALESCE(gs.setting_type, gls.setting_type) as setting_type
        FROM global_settings gls
        LEFT JOIN guild_settings gs ON gls.setting_name = gs.setting_name
        ORDER BY gls.setting_name;
      END;
      $$ LANGUAGE plpgsql
    `);
    logger.info('✅ PostgreSQL functions created');

    // Verify all tables exist
    logger.info('🔍 Verifying all tables were created...');
    const tableCount = await pgdb.query<{ count: number }>('SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = \'public\'');
    logger.info(`✅ Database initialization complete! Created ${tableCount[0]?.count || 0} tables`);

    // Test the database
    logger.info('🧪 Testing database functionality...');
    const testQueries = [
      'SELECT COUNT(*) FROM embed_settings WHERE guild_id = \'global\'',
      'SELECT COUNT(*) FROM giveaways',
      'SELECT column_name FROM information_schema.columns WHERE table_name = \'giveaways\' AND column_name = \'host_id\''
    ];

    for (const query of testQueries) {
      const result = await pgdb.query(query);
      logger.info(`✅ Test query successful: ${result[0]}`);
    }

    logger.info('🎉 COMPLETE DATABASE INITIALIZATION SUCCESSFUL!');
    logger.info('📊 All tables, columns, indexes, and default data created');
    logger.info('🚀 No more migrations needed - everything is ready to go!');

  } catch (error) {
    logger.critical('❌ Complete database initialization failed:', error);
    throw new Error('Complete database initialization failed. Check logs for details.');
  }
}

// Export for use in other scripts
export { completeDatabaseInit };
