import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Role Reaction interfaces
export interface RoleReactionButton {
  role_reaction_id: string;
  role_id: string;
  emoji: string;
  label: string;
  style: string;
  position: number;
  created_at: Date;
}

export interface RoleReaction {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  name: string;
  creator_id: string;
  created_at: Date;
}

export interface RoleReactionWithButtons extends RoleReaction {
  buttons?: RoleReactionButton[];
}

// Custom embed interfaces
export interface CustomEmbed {
  id: string;
  guild_id: string;
  creator_id: string;
  name: string | null;
  title: string | null;
  description: string | null;
  color: string;
  thumbnail: string | null;
  image: string | null;
  footer: string | null;
  timestamp: boolean;
  author_name: string | null;
  author_icon_url: string | null;
  author_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CustomEmbedField {
  id: string;
  embed_id: string;
  name: string;
  value: string;
  inline: boolean;
  position: number;
  created_at: Date;
}

export interface CustomEmbedWithFields extends CustomEmbed {
  fields?: CustomEmbedField[];
}

// Guild settings interface
export interface GuildSettings {
  guild_id: string;
  prefix?: string;
  mod_role_id?: string;
  admin_role_id?: string;
  mute_role_id?: string;
  log_channel_id?: string;
  welcome_channel_id?: string;
  welcome_message?: string;
  farewell_message?: string;
  lfg_channel_id?: string;
  created_at: Date;
  updated_at: Date;
}

// Log settings interface
export interface LogSettings {
  guild_id: string;
  mod_commands: boolean;
  voice_join: boolean;
  voice_leave: boolean;
  message_delete: boolean;
  message_edit: boolean;
  member_join: boolean;
  member_leave: boolean;
  ban_add: boolean;
  ban_remove: boolean;
  kick: boolean;
  mute_add: boolean;
  mute_remove: boolean;
  warn_add: boolean;
  warn_remove: boolean;
  role_changes: boolean;
  created_at: Date;
  updated_at: Date;
}

// Interface for giveaways
export interface Giveaway {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  prize: string;
  description: string | null;
  winners_count: number;
  requirement: string | null;
  ends_at: Date;
  created_at: Date;
  ended: boolean;
  // Virtual properties computed from the entries table
  participants_count?: number;
  winners?: string[];
}

// Interface for giveaway entries
export interface GiveawayEntry {
  id: string;
  giveaway_id: string;
  user_id: string;
  is_winner: boolean;
  entered_at: Date;
}

// Add these type definitions with the other types at the top of the file
export interface LfgSession {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string;
  message_id: string;
  host_id: string;
  mission_name: string;
  player_count: number;
  max_players: number;
  status: 'OPEN' | 'FULL' | 'CLOSED';
  created_at: Date;
  updated_at: Date;
  closed_at?: Date;
}

export interface LfgParticipant {
  id: number;
  session_id: string;
  user_id: string;
  joined_at: Date;
}

// The type for our Database client
export type PostgresClient = {
  pool: Pool;
  query<T>(text: string, params?: any[]): Promise<T[]>;
  transaction<T>(queries: { text: string; params: any[] }[]): Promise<T[][]>;
  createTableIfNotExists(tableName: string, columns: string): Promise<void>;
  ensureUserExists(id: string, username: string, discriminator?: string, avatar?: string): Promise<void>;
  ensureGuildExists(id: string, name: string, icon?: string, ownerId?: string, memberCount?: number): Promise<void>;
  addWarning(userId: string, guildId: string, moderatorId: string, reason: string): Promise<number>;
  getWarnings(userId: string, guildId: string, activeOnly?: boolean): Promise<any[]>;
  removeWarning(warningId: number): Promise<boolean>;
  deleteInactiveWarnings(olderThanDays: number): Promise<number>;
  deleteOldGiveaways(olderThanDays: number): Promise<number>;
  deleteOldLfgSessions(olderThanDays: number): Promise<number>;
  createRoleReaction(guildId: string, channelId: string, messageId: string, name: string, creatorId: string): Promise<RoleReaction>;
  getRoleReactionByMessage(messageId: string): Promise<RoleReactionWithButtons | null>;
  getRoleReactionById(id: string): Promise<RoleReactionWithButtons | null>;
  getRoleReactionsByGuild(guildId: string): Promise<RoleReaction[]>;
  addRoleReactionButton(roleReactionId: string, roleId: string, emoji: string, label: string, style: string, position: number): Promise<RoleReactionButton>;
  removeRoleReactionButton(roleReactionId: string, roleId: string): Promise<void>;
  deleteRoleReaction(id: string): Promise<void>;
  updateRoleReactionMessage(id: string, messageId: string): Promise<void>;
  getRoleReactionButtons(roleReactionId: string): Promise<RoleReactionButton[]>;
  
  // Custom embeds methods
  createCustomEmbed(
    guildId: string, 
    creatorId: string, 
    name?: string | null, 
    options?: Partial<Omit<CustomEmbed, 'id' | 'guild_id' | 'creator_id' | 'name' | 'created_at' | 'updated_at'>>
  ): Promise<CustomEmbed>;
  getCustomEmbedById(id: string): Promise<CustomEmbedWithFields | null>;
  getCustomEmbedByName(guildId: string, name: string): Promise<CustomEmbedWithFields | null>;
  getCustomEmbedsByGuild(guildId: string): Promise<CustomEmbed[]>;
  updateCustomEmbed(
    id: string, 
    options: Partial<Omit<CustomEmbed, 'id' | 'guild_id' | 'creator_id' | 'created_at' | 'updated_at'>>
  ): Promise<CustomEmbed | null>;
  deleteCustomEmbed(id: string): Promise<void>;
  addCustomEmbedField(
    embedId: string, 
    name: string, 
    value: string, 
    inline?: boolean, 
    position?: number
  ): Promise<CustomEmbedField>;
  updateCustomEmbedField(
    fieldId: string, 
    options: Partial<Omit<CustomEmbedField, 'id' | 'embed_id' | 'created_at'>>
  ): Promise<CustomEmbedField | null>;
  removeCustomEmbedField(fieldId: string): Promise<void>;
  getCustomEmbedFields(embedId: string): Promise<CustomEmbedField[]>;
  
  // Guild settings methods
  getGuildSettings(guildId: string): Promise<GuildSettings | null>;
  updateGuildSetting(guildId: string, setting: string, value: any): Promise<GuildSettings>;
  
  // Welcome channel methods
  setWelcomeChannel(guildId: string, channelId: string): Promise<void>;
  getWelcomeChannel(guildId: string): Promise<string | null>;

  // Log settings methods
  getLogSettings(guildId: string): Promise<LogSettings | null>;
  updateLogSetting(guildId: string, setting: keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>, value: boolean): Promise<boolean>;
  isLogTypeEnabled(guildId: string, logType: keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>): Promise<boolean>;

  // Giveaway methods
  getCustomEmbedFieldsById(embedId: string): Promise<CustomEmbedField[]>;
  createGiveaway(
    guildId: string,
    channelId: string,
    creatorId: string,
    prize: string,
    description: string | null,
    winnersCount: number,
    requirement: string | null,
    endsAt: Date
  ): Promise<Giveaway>;
  setGiveawayMessageId(giveawayId: string, messageId: string): Promise<void>;
  getGiveawayById(giveawayId: string): Promise<Giveaway | null>;
  getGiveawayByMessageId(messageId: string): Promise<Giveaway | null>;
  getActiveGiveawaysForGuild(guildId: string): Promise<Giveaway[]>;
  getExpiredGiveaways(): Promise<Giveaway[]>;
  addGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean>;
  removeGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean>;
  isGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean>;
  endGiveaway(giveawayId: string): Promise<string[]>;
  rerollGiveaway(giveawayId: string, winnersCount?: number): Promise<string[]>;
  deleteGiveaway(giveawayId: string): Promise<boolean>;

  // LFG Session methods
  createLfgSession(
    guildId: string,
    channelId: string,
    threadId: string,
    messageId: string,
    hostId: string,
    missionName: string
  ): Promise<LfgSession | null>;
  getLfgSession(threadId: string): Promise<LfgSession | null>;
  updateLfgSessionStatus(
    sessionId: string,
    status: 'OPEN' | 'FULL' | 'CLOSED',
    playerCount?: number
  ): Promise<boolean>;
  updateLfgPlayerCount(sessionId: string, playerCount: number): Promise<boolean>;
  addLfgParticipant(sessionId: string, userId: string): Promise<boolean>;
  getCompletedLfgCount(userId: string, guildId?: string): Promise<number>;
  getLfgLeaderboard(guildId: string, limit?: number): Promise<Array<{ user_id: string, completed_count: number }>>;
  getLfgSessionsForCleanup(
    fullThreadHours: number,
    openThreadHours: number
  ): Promise<LfgSession[]>;
  deleteLfgSession(sessionId: string): Promise<boolean>;

  // ============= Warframe Notification Methods =============

  // Fissure Notifications
  getFissureNotifications(): Promise<any[]>;
  getFissureNotificationsByType(missionType: string, steelPath: boolean): Promise<any[]>;
  addFissureNotification(guildId: string, channelId: string, missionType: string, steelPath: boolean, roleId?: string): Promise<any>;
  updateFissureLastNotified(id: string, lastNotified: string): Promise<void>;
  updateFissureMessageId(id: string, messageId: string): Promise<void>;
  removeFissureNotification(id: string): Promise<void>;

  // Aya Notifications
  getAyaNotifications(): Promise<any[]>;
  addAyaNotification(guildId: string, channelId: string, roleId?: string, messageId?: string): Promise<any>;
  updateAyaMessageId(id: string, messageId: string): Promise<void>;
  removeAyaNotification(id: string): Promise<void>;

  // Baro Notifications
  getBaroNotifications(): Promise<any[]>;
  addBaroNotification(guildId: string, channelId: string, roleId?: string, messageId?: string): Promise<any>;
  updateBaroMessageId(id: string, messageId: string): Promise<void>;
  removeBaroNotification(id: string): Promise<void>;

  // Arbitration Notifications
  getArbitrationNotifications(): Promise<any[]>;
  addArbitrationNotification(
    guildId: string, 
    channelId: string, 
    roleId?: string | null, 
    messageId?: string | null,
    sTierRoleId?: string | null,
    aTierRoleId?: string | null,
    bTierRoleId?: string | null,
    cTierRoleId?: string | null,
    dTierRoleId?: string | null,
    fTierRoleId?: string | null
  ): Promise<any>;
  updateArbitrationMessageId(id: string, messageId: string): Promise<void>;
  removeArbitrationNotification(id: string): Promise<void>;

  // PostgreSQL Incarnon notification handling
  getIncarnonNotifications(): Promise<any[]>;
  getIncarnonNotificationByGuild(guildId: string): Promise<any>;
  addIncarnonNotification(guildId: string, channelId: string, roleId: string | null): Promise<any>;
  updateIncarnonNotification(id: string, channelId: string, roleId: string | null): Promise<boolean>;
  updateIncarnonMessageId(id: string, messageId: string): Promise<boolean>;
  removeIncarnonNotification(guildId: string): Promise<boolean>;
};

/**
 * PostgreSQL database service for the Discord bot
 * Improved with better connection handling and retry logic
 */
class PostgresDatabase {
  private pool: Pool;
  private isConnected: boolean = false;
  private static instance: PostgresDatabase;
  private connectionRetries: number = 0;
  private readonly MAX_RETRIES = 15; // Increased from 5 to 15
  private retryTimeout?: NodeJS.Timeout;
  private client: PoolClient | null = null;
  private reconnectingInProgress: boolean = false;
  private lastErrorTime: number = 0;
  private initialized: boolean = false;
  
  // Added connection backoff parameters
  private readonly INITIAL_BACKOFF_MS = 1000; // Start with 1 second
  private readonly MAX_BACKOFF_MS = 5 * 60 * 1000; // Max 5 minutes
  private readonly BACKOFF_JITTER = 0.1; // 10% random jitter for backoff

  private constructor() {
    this.setupConnectionPool();
    
    // Set up periodic connection check every 5 minutes
    setInterval(() => this.checkPoolHealth(), 5 * 60 * 1000);
    
    // Start the connection test process asynchronously
    this.testConnection().then(() => {
      this.initialized = true;
      logger.info('PostgreSQL pool initialized and connection tested successfully');
    }).catch(error => {
      logger.warn('Initial PostgreSQL connection test failed, will retry automatically', error);
      // The reconnection mechanism will handle further attempts
    });
  }
  
  /**
   * Set up the connection pool with required parameters
   */
  private setupConnectionPool() {
    // Create a connection pool with improved settings
    this.pool = new Pool({
      host: config.PG_HOST,
      port: config.PG_PORT,
      database: config.PG_DATABASE,
      user: config.PG_USER,
      password: config.PG_PASSWORD,
      ssl: config.PG_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
      allowExitOnIdle: false, // Don't allow process to exit when there are idle connections
    });

    // Set up error handler
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
      this.handleConnectionError(err);
    });
    
    // Set up additional event handlers
    this.pool.on('connect', (client) => {
      logger.db('New PostgreSQL client connected');
    });
    
    this.pool.on('remove', (client) => {
      logger.db('PostgreSQL client removed from pool');
    });
  }

  /**
   * Get the singleton instance of the database service
   */
  public static getInstance(): PostgresDatabase {
    if (!PostgresDatabase.instance) {
      try {
        PostgresDatabase.instance = new PostgresDatabase();
      } catch (error) {
        // Log the error but don't throw - let the reconnection logic handle it
        logger.error('Error creating PostgreSQL database instance:', error);
        // Create a minimal instance that will trigger reconnection on first query
        PostgresDatabase.instance = new PostgresDatabase();
        PostgresDatabase.instance.isConnected = false;
      }
    }
    return PostgresDatabase.instance;
  }

  /**
   * Check the health of the connection pool
   */
  private async checkPoolHealth(): Promise<void> {
    if (this.reconnectingInProgress) {
      logger.debug('Reconnection already in progress, skipping health check');
      return;
    }
    
    if (!this.isConnected) {
      logger.warn('Database connection check: Not connected. Attempting to reconnect...');
      await this.reconnectWithBackoff();
      return;
    }
    
    try {
      // Test with a simple query
      const result = await this.query<{ now: Date }>('SELECT NOW() as now');
      logger.debug(`Database connection check: OK (${result[0]?.now})`);
      
      // If we had previous errors but now we're working, reduce retry counter
      if (this.connectionRetries > 0) {
        this.connectionRetries = Math.max(0, this.connectionRetries - 1);
      }
    } catch (error) {
      logger.warn('Database connection check: Failed. Attempting to reconnect...');
      await this.reconnectWithBackoff();
    }
  }

  /**
   * Handle a connection error with retry logic and exponential backoff
   */
  private handleConnectionError(error: Error): void {
    // Record error time to prevent retry flooding
    const now = Date.now();
    if (now - this.lastErrorTime < 1000) {
      // If errors are happening too fast, increase retry counter more aggressively
      this.connectionRetries = Math.min(this.connectionRetries + 2, this.MAX_RETRIES);
    }
    this.lastErrorTime = now;
    
    // Check if we should retry
    if (this.isRecoverableError(error) && this.connectionRetries < this.MAX_RETRIES) {
      this.reconnectWithBackoff();
    } else if (this.connectionRetries >= this.MAX_RETRIES) {
      this.isConnected = false;
      logger.critical(`PostgreSQL connection failed after ${this.MAX_RETRIES} retries. Further database operations may fail.`, error);
      
      // Set a longer timeout before trying again (30 minutes)
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
      this.retryTimeout = setTimeout(() => {
        logger.info('Attempting database reconnection after extended cooldown');
        this.connectionRetries = this.MAX_RETRIES / 2; // Reset retry counter to half
        this.reconnectWithBackoff();
      }, 30 * 60 * 1000);
    }
  }
  
  /**
   * Check if an error is recoverable (connection issues vs. query syntax errors)
   */
  private isRecoverableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // List of known recoverable error messages
    const recoverableErrors = [
      'connection',
      'timeout',
      'connection terminated',
      'server closed',
      'server connection',
      'socket',
      'unexpected end of file',
      'connection reset',
      'connection refused',
      'network',
      'econnrefused',
      'ehostunreach',
      'no pg_hba.conf',
      'too many clients',
      'connection terminated unexpectedly',
      'terminating connection'
    ];
    
    return recoverableErrors.some(msg => errorMessage.includes(msg));
  }
  
  /**
   * Reconnect with exponential backoff
   */
  private async reconnectWithBackoff(): Promise<void> {
    if (this.reconnectingInProgress) {
      return; // Prevent multiple reconnection attempts
    }
    
    this.reconnectingInProgress = true;
    this.isConnected = false;
    this.connectionRetries++;
    
    try {
      // Calculate backoff with jitter
      const baseDelay = Math.min(
        this.INITIAL_BACKOFF_MS * Math.pow(2, this.connectionRetries - 1),
        this.MAX_BACKOFF_MS
      );
      
      // Add some randomness to prevent reconnection thundering herd
      const jitter = 1 - this.BACKOFF_JITTER + (Math.random() * this.BACKOFF_JITTER * 2);
      const delay = Math.floor(baseDelay * jitter);
      
      logger.warn(`PostgreSQL connection error. Retry ${this.connectionRetries}/${this.MAX_RETRIES} scheduled in ${delay/1000} seconds.`);
      
      // Clear any existing timeout
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
      
      // Set a new timeout for reconnection
      this.retryTimeout = setTimeout(async () => {
        try {
          await this.testConnection();
        } finally {
          this.reconnectingInProgress = false;
        }
      }, delay);
    } catch (error) {
      this.reconnectingInProgress = false;
      logger.error('Error during reconnection scheduling:', error);
    }
  }

  /**
   * Test the database connection
   */
  private async testConnection(): Promise<void> {
    try {
      // Create a new pool if needed
      if (!this.pool || this.pool.ended) {
        logger.info('Recreating PostgreSQL connection pool');
        this.setupConnectionPool();
      }
      
      const client = await this.pool.connect();
      try {
        // Run a test query to verify the connection is working
        await client.query('SELECT 1');
        this.isConnected = true;
        
        // Only partially reset retry counter to be more conservative
        if (this.connectionRetries > 0) {
          this.connectionRetries = Math.max(0, this.connectionRetries - 2); 
        }
        
        // Mark as initialized if not already
        if (!this.initialized) {
          this.initialized = true;
        }
        
        logger.info('Successfully connected to PostgreSQL database');
      } finally {
        client.release();
      }
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to PostgreSQL database:', error);
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Execute a query with parameters and retry on connection failures
   */
  public async query<T>(text: string, params: any[] = []): Promise<T[]> {
    return this.executeWithRetry(async () => {
      const { rows } = await this.pool.query(text, params);
      return rows as T[];
    }, text);
  }
  
  /**
   * Execute a function with retry on database connection failures
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, operation: string = 'database operation'): Promise<T> {
    // Local retry counter to allow per-operation retries
    let retries = 0;
    const MAX_LOCAL_RETRIES = 3;
    
    // If the database hasn't been fully initialized yet, wait a bit
    if (!this.initialized && !this.isConnected) {
      retries++;
      logger.warn(`Database not yet initialized, waiting before attempting ${operation}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.reconnectWithBackoff();
    }
    
    while (true) {
      try {
        if (!this.isConnected) {
          logger.warn(`Attempting ${operation} while not connected. Reconnecting first...`);
          await this.reconnectWithBackoff();
          
          if (!this.isConnected) {
            throw new Error('Database connection is not available');
          }
        }
        
        return await fn();
      } catch (error) {
        // If this is a connection error, try to reconnect
        if (error instanceof Error && this.isRecoverableError(error)) {
          retries++;
          
          if (retries <= MAX_LOCAL_RETRIES) {
            logger.warn(`Database operation "${operation}" failed due to connection issues. Retrying (${retries}/${MAX_LOCAL_RETRIES})...`);
            await this.reconnectWithBackoff();
            continue;
          }
        }
        
        // Either not a connection error or too many retries
        logger.error(`Error executing database operation: ${operation}`, error);
        throw error;
      }
    }
  }

  /**
   * Get a client from the pool for transaction support with retry logic
   */
  public async getClient(): Promise<PoolClient> {
    return this.executeWithRetry(async () => {
      const client = await this.pool.connect();
      
      // Monkey patch the release method to catch connection issues
      const originalRelease = client.release;
      client.release = () => {
        client.release = originalRelease;
        client.release(true); // Release with immediate flag
        logger.db('Client released back to the pool');
      };
      
      return client;
    }, 'getClient');
  }
  
  /**
   * Execute multiple queries in a transaction
   */
  public async transaction<T>(queries: { text: string; params: any[] }[]): Promise<T[][]> {
    return this.executeTransaction(async (client) => {
      const results: T[][] = [];
      for (const query of queries) {
        const { rows } = await client.query(query.text, query.params);
        results.push(rows as T[]);
      }
      return results;
    });
  }
  
  /**
   * Execute a transaction with automatic retry on connection failures
   */
  public async executeTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    let retries = 0;
    const MAX_TRANSACTION_RETRIES = 3;
    
    while (true) {
      const client = await this.getClient();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          // Try to rollback, but don't throw if it fails (connection might be dead)
          await client.query('ROLLBACK').catch(e => 
            logger.warn(`Rollback failed, likely due to connection issues: ${e instanceof Error ? e.message : String(e)}`)
          );
        } catch (rollbackError) {
          // Ignore rollback errors, focus on the original error
          logger.warn(`Rollback error suppressed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
        
        // If this is a connection error, try to reconnect and retry
        if (error instanceof Error && this.isRecoverableError(error) && retries < MAX_TRANSACTION_RETRIES) {
          retries++;
          logger.warn(`Transaction failed due to connection issues. Retrying (${retries}/${MAX_TRANSACTION_RETRIES})...`);
          await this.reconnectWithBackoff();
          continue;
        }
        
        // Either not a connection error or too many retries
        logger.error('Error executing transaction:', error);
        throw error;
      } finally {
        try {
          client.release();
        } catch (releaseError) {
          // Just log release errors but don't throw
          logger.warn(`Error releasing client back to pool: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
        }
      }
    }
  }

  /**
   * Insert a record into a table
   */
  public async insert<T>(tableName: string, data: Record<string, any>): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columnNames = keys.join(', ');

    const queryText = `
      INSERT INTO ${tableName} (${columnNames})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const rows = await this.query<T>(queryText, values);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Update records in a table
   */
  public async update<T>(
    tableName: string,
    data: Record<string, any>,
    whereClause: string,
    whereParams: any[] = []
  ): Promise<T[]> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    
    // Build SET clause
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    
    // Adjust placeholder indices for where clause
    const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, index) => {
      return `$${parseInt(index) + keys.length}`;
    });
    
    const queryText = `
      UPDATE ${tableName}
      SET ${setClause}
      ${whereClause ? `WHERE ${adjustedWhereClause}` : ''}
      RETURNING *
    `;
    
    return this.query<T>(queryText, [...values, ...whereParams]);
  }

  /**
   * Find records in a table
   */
  public async find<T>(
    tableName: string, 
    whereClause: string = '', 
    whereParams: any[] = [],
    orderBy: string = '',
    limit: number = 0
  ): Promise<T[]> {
    let queryText = `SELECT * FROM ${tableName}`;
    
    if (whereClause) {
      queryText += ` WHERE ${whereClause}`;
    }
    
    if (orderBy) {
      queryText += ` ORDER BY ${orderBy}`;
    }
    
    if (limit > 0) {
      queryText += ` LIMIT ${limit}`;
    }
    
    return this.query<T>(queryText, whereParams);
  }

  /**
   * Delete records from a table
   */
  public async delete(
    tableName: string, 
    whereClause: string, 
    whereParams: any[] = []
  ): Promise<number> {
    const queryText = `
      DELETE FROM ${tableName}
      WHERE ${whereClause}
    `;
    
    const result = await this.executeWithRetry(async () => {
      return await this.pool.query(queryText, whereParams);
    }, `DELETE FROM ${tableName}`);
    
    return result.rowCount || 0;
  }

  /**
   * Create a table if it doesn't exist
   */
  public async createTableIfNotExists(tableName: string, schema: string): Promise<void> {
    try {
      const queryText = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          ${schema}
        )
      `;
      
      await this.query(queryText);
      logger.info(`Ensured table ${tableName} exists`);
    } catch (error) {
      logger.error(`Error creating table ${tableName}:`, error);
      throw error; // Rethrow to allow for better error handling by caller
    }
  }

  /**
   * Warframe catalog CRUD
   */
  public async upsertWarframe(item: { id?: string, name: string, crafting_cost?: number, resources?: any, updated_by?: string }): Promise<any> {
    const idRow = await this.query<{ uuid: string }>('SELECT uuid_generate_v4() as uuid');
    const id = item.id || idRow[0].uuid;
    const rows = await this.query<any>(
      `INSERT INTO warframe_catalog (id, name, crafting_cost, resources, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         crafting_cost = EXCLUDED.crafting_cost,
         resources = EXCLUDED.resources,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [id, item.name, item.crafting_cost ?? null, item.resources ?? {}, item.updated_by ?? null]
    );
    return rows[0];
  }

  public async getWarframes(): Promise<any[]> {
    return this.query<any>('SELECT * FROM warframe_catalog ORDER BY name');
  }

  public async getWarframeById(id: string): Promise<any | null> {
    const rows = await this.query<any>('SELECT * FROM warframe_catalog WHERE id = $1', [id]);
    return rows[0] || null;
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    try {
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
      
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error; // Rethrow to allow for better error handling by caller
    }
  }

  // Role Reactions
  
  /**
   * Ensures a user exists in the database
   */
  public async ensureUserExists(userId: string, username: string = 'Unknown User'): Promise<void> {
    try {
      // Check if user exists
      const existingUser = await this.query(
        `SELECT id FROM users WHERE id = $1`,
        [userId]
      );
      
      // If user doesn't exist, create them
      if (existingUser.length === 0) {
        logger.debug(`User ${userId} doesn't exist in database, creating entry`);
        await this.query(
          `INSERT INTO users (id, username) 
           VALUES ($1, $2)
           ON CONFLICT (id) DO NOTHING`,
          [userId, username]
        );
        logger.debug(`Created user entry for ${userId}`);
      }
    } catch (error) {
      logger.error(`Error ensuring user exists: ${error}`);
      // Don't throw error here to avoid breaking features that depend on this
    }
  }

  /**
   * Creates a new role reaction
   */
  public async createRoleReaction(
    guildId: string,
    channelId: string,
    messageId: string,
    name: string,
    creatorId: string
  ): Promise<RoleReaction> {
    try {
      logger.debug(`Creating role reaction: ${name} in guild ${guildId} by ${creatorId}`);
      
      // Ensure the creator exists in the users table
      await this.ensureUserExists(creatorId);
      
      // Generate a UUID for the role reaction
      const uuid = await this.query<{ uuid: string }>('SELECT uuid_generate_v4() as uuid');
      const id = uuid[0].uuid;
      
      // Insert the role reaction
      const result = await this.query<RoleReaction>(
        `INSERT INTO role_reactions 
        (id, guild_id, channel_id, message_id, name, creator_id) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`,
        [id, guildId, channelId, messageId, name, creatorId]
      );
      
      logger.info(`Created role reaction: ${name} (${id}) in guild ${guildId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error creating role reaction: ${error}`);
      throw new Error(`Failed to create role reaction: ${error}`);
    }
  }
  
  /**
   * Adds a button to a role reaction
   */
  public async addRoleReactionButton(
    roleReactionId: string,
    roleId: string,
    emoji: string,
    label: string,
    style: string,
    position: number
  ): Promise<RoleReactionButton> {
    try {
      logger.debug(`Adding button for role ${roleId} to role reaction ${roleReactionId}`);
      
      // Insert the button
      const result = await this.query<RoleReactionButton>(
        `INSERT INTO role_reaction_buttons 
        (role_reaction_id, role_id, emoji, label, style, position) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`,
        [roleReactionId, roleId, emoji, label, style, position]
      );
      
      logger.info(`Added button for role ${roleId} to role reaction ${roleReactionId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error adding role reaction button: ${error}`);
      throw new Error(`Failed to add role reaction button: ${error}`);
    }
  }
  
  /**
   * Removes a button from a role reaction
   */
  public async removeRoleReactionButton(
    roleReactionId: string,
    roleId: string
  ): Promise<void> {
    try {
      logger.debug(`Removing button for role ${roleId} from role reaction ${roleReactionId}`);
      
      // Delete the button
      await this.query(
        `DELETE FROM role_reaction_buttons 
        WHERE role_reaction_id = $1 AND role_id = $2`,
        [roleReactionId, roleId]
      );
      
      // Reorder the remaining buttons
      await this.query(
        `WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 as new_position
          FROM role_reaction_buttons
          WHERE role_reaction_id = $1
        )
        UPDATE role_reaction_buttons b
        SET position = n.new_position
        FROM numbered n
        WHERE b.id = n.id`,
        [roleReactionId]
      );
      
      logger.info(`Removed button for role ${roleId} from role reaction ${roleReactionId}`);
    } catch (error) {
      logger.error(`Error removing role reaction button: ${error}`);
      throw new Error(`Failed to remove role reaction button: ${error}`);
    }
  }
  
  /**
   * Gets a role reaction by ID
   */
  public async getRoleReactionById(id: string): Promise<RoleReactionWithButtons | null> {
    try {
      logger.db(`Getting role reaction by ID: ${id}`);
      
      // Get the role reaction
      const result = await this.query<RoleReaction>(
        `SELECT * FROM role_reactions WHERE id = $1`,
        [id]
      );
      
      if (result.length === 0) {
        logger.db(`No role reaction found with ID: ${id}`);
        return null;
      }
      
      const roleReaction = result[0];
      
      // Get the buttons for this role reaction
      const buttons = await this.query<RoleReactionButton>(
        `SELECT * FROM role_reaction_buttons WHERE role_reaction_id = $1 ORDER BY position`,
        [id]
      );
      
      return {
        ...roleReaction,
        buttons: buttons
      };
    } catch (error) {
      logger.error(`Error getting role reaction by ID: ${error}`);
      throw new Error(`Failed to get role reaction: ${error}`);
    }
  }
  
  /**
   * Gets a role reaction by message ID
   */
  public async getRoleReactionByMessage(messageId: string): Promise<RoleReactionWithButtons | null> {
    try {
      logger.db(`Getting role reaction for message ID: ${messageId}`);
      
      // Get the role reaction
      const result = await this.query<RoleReaction>(
        `SELECT * FROM role_reactions WHERE message_id = $1`,
        [messageId]
      );
      
      if (result.length === 0) {
        logger.db(`No role reaction found for message ID: ${messageId}`);
        return null;
      }
      
      const roleReaction = result[0];
      
      // Get the buttons for this role reaction
      const buttons = await this.query<RoleReactionButton>(
        `SELECT * FROM role_reaction_buttons WHERE role_reaction_id = $1 ORDER BY position`,
        [roleReaction.id]
      );
      
      return {
        ...roleReaction,
        buttons: buttons
      };
    } catch (error) {
      logger.error(`Error getting role reaction by message ID: ${error}`);
      throw new Error(`Failed to get role reaction: ${error}`);
    }
  }
  
  /**
   * Gets all role reactions for a guild
   */
  public async getRoleReactionsByGuild(guildId: string): Promise<RoleReaction[]> {
    try {
      logger.db(`Getting role reactions for guild: ${guildId}`);
      
      // Get all role reactions for this guild
      const result = await this.query<RoleReaction>(
        `SELECT * FROM role_reactions WHERE guild_id = $1 ORDER BY created_at DESC`,
        [guildId]
      );
      
      logger.db(`Found ${result.length} role reactions for guild ${guildId}`);
      return result;
    } catch (error) {
      logger.error(`Error getting role reactions by guild: ${error}`);
      throw new Error(`Failed to get role reactions: ${error}`);
    }
  }
  
  /**
   * Deletes a role reaction
   */
  public async deleteRoleReaction(id: string): Promise<void> {
    try {
      logger.db(`Deleting role reaction: ${id}`);
      
      // First delete all buttons associated with this role reaction
      await this.query(
        `DELETE FROM role_reaction_buttons WHERE role_reaction_id = $1`,
        [id]
      );
      
      logger.db(`Deleted all buttons for role reaction: ${id}`);
      
      // Then delete the role reaction itself
      await this.query(
        `DELETE FROM role_reactions WHERE id = $1`,
        [id]
      );
      
      logger.info(`Deleted role reaction: ${id}`);
    } catch (error) {
      logger.error(`Error deleting role reaction: ${error}`);
      throw new Error(`Failed to delete role reaction: ${error}`);
    }
  }
  
  /**
   * Updates the message ID for a role reaction
   */
  public async updateRoleReactionMessage(id: string, messageId: string): Promise<void> {
    try {
      logger.debug(`Updating message ID for role reaction ${id} to ${messageId}`);
      
      await this.query(
        `UPDATE role_reactions SET message_id = $1 WHERE id = $2`,
        [messageId, id]
      );
      
      logger.info(`Updated message ID for role reaction ${id}`);
    } catch (error) {
      logger.error(`Error updating role reaction message ID: ${error}`);
      throw new Error(`Failed to update role reaction message ID: ${error}`);
    }
  }
  
  /**
   * Gets role reaction buttons for a role reaction
   */
  public async getRoleReactionButtons(roleReactionId: string): Promise<RoleReactionButton[]> {
    try {
      logger.db(`Getting buttons for role reaction: ${roleReactionId}`);
      
      const buttons = await this.query<RoleReactionButton>(
        `SELECT * FROM role_reaction_buttons WHERE role_reaction_id = $1 ORDER BY position`,
        [roleReactionId]
      );
      
      logger.db(`Found ${buttons.length} buttons for role reaction ${roleReactionId}`);
      return buttons;
    } catch (error) {
      logger.error(`Error getting role reaction buttons: ${error}`);
      throw new Error(`Failed to get role reaction buttons: ${error}`);
    }
  }
  
  /**
   * Ensures a guild exists in the database
   */
  public async ensureGuildExists(
    id: string,
    name: string,
    icon?: string,
    ownerId?: string,
    memberCount?: number
  ): Promise<void> {
    const query = `
      INSERT INTO guilds (id, name, icon, owner_id, member_count)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET name = $2, icon = $3, owner_id = COALESCE($4, guilds.owner_id), 
          member_count = COALESCE($5, guilds.member_count), updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.query(query, [id, name, icon || null, ownerId || null, memberCount || 0]);
  }
  
  /**
   * Adds a warning to a user
   */
  public async addWarning(
    userId: string,
    guildId: string,
    moderatorId: string,
    reason: string
  ): Promise<number> {
    const query = `
      INSERT INTO warnings (user_id, guild_id, moderator_id, reason)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    
    const result = await this.query<{ id: number }>(query, [userId, guildId, moderatorId, reason]);
    return result[0].id;
  }
  
  /**
   * Gets all warnings for a user in a guild
   */
  public async getWarnings(
    userId: string,
    guildId: string,
    activeOnly: boolean = false
  ): Promise<any[]> {
    let query = `
      SELECT w.*, u.username as moderator_name
      FROM warnings w
      LEFT JOIN users u ON w.moderator_id = u.id
      WHERE w.user_id = $1 AND w.guild_id = $2
    `;
    
    const params = [userId, guildId];
    
    if (activeOnly) {
      query += ' AND w.active = true';
    }
    
    query += ' ORDER BY w.created_at DESC';
    
    return this.query(query, params);
  }
  
  /**
   * Deactivates a warning
   */
  public async removeWarning(warningId: number): Promise<boolean> {
    const query = `
      UPDATE warnings
      SET active = false
      WHERE id = $1
      RETURNING id
    `;
    
    const result = await this.query<{ id: number }>(query, [warningId]);
    return result.length > 0;
  }

  /**
   * Creates a new custom embed
   */
  public async createCustomEmbed(
    guildId: string,
    creatorId: string,
    name?: string | null,
    options?: Partial<Omit<CustomEmbed, 'id' | 'guild_id' | 'creator_id' | 'name' | 'created_at' | 'updated_at'>>
  ): Promise<CustomEmbed> {
    try {
      // Ensure the creator exists in the users table
      await this.ensureUserExists(creatorId);
      
      const opts = options || {};
      // Generate a UUID for the embed
      const uuid = await this.query<{ uuid: string }>('SELECT uuid_generate_v4() as uuid');
      const id = uuid[0].uuid;
      
      // If name is not provided, use title or generate a default
      const embedName = name || opts.title || `Embed-${id.substring(0, 8)}`;
      
      // Insert the custom embed
      const result = await this.query<CustomEmbed>(
        `INSERT INTO custom_embeds 
        (id, guild_id, creator_id, name, title, description, color, thumbnail, image, 
         footer, timestamp, author_name, author_icon_url, author_url) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
        RETURNING *`,
        [
          id, 
          guildId, 
          creatorId, 
          embedName, 
          opts.title || null, 
          opts.description || null, 
          opts.color || '#5865F2', 
          opts.thumbnail || null, 
          opts.image || null, 
          opts.footer || null, 
          opts.timestamp || false, 
          opts.author_name || null, 
          opts.author_icon_url || null, 
          opts.author_url || null
        ]
      );
      
      logger.info(`Created custom embed: ${embedName} (${id}) in guild ${guildId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error creating custom embed: ${error}`);
      throw new Error(`Failed to create custom embed: ${error}`);
    }
  }
  
  /**
   * Gets a custom embed by its ID, including its fields
   */
  public async getCustomEmbedById(id: string): Promise<CustomEmbedWithFields | null> {
    try {
      // Get the embed
      const embeds = await this.query<CustomEmbed>(
        `SELECT * FROM custom_embeds WHERE id = $1`,
        [id]
      );
      
      if (embeds.length === 0) {
        return null;
      }
      
      // Get the fields
      const fields = await this.getCustomEmbedFields(id);
      
      // Combine them
      return {
        ...embeds[0],
        fields
      };
    } catch (error) {
      logger.error(`Error getting custom embed by ID: ${error}`);
      return null;
    }
  }
  
  /**
   * Gets a custom embed by its name and guild ID
   */
  public async getCustomEmbedByName(guildId: string, name: string): Promise<CustomEmbedWithFields | null> {
    try {
      // Get the embed
      const embeds = await this.query<CustomEmbed>(
        `SELECT * FROM custom_embeds WHERE guild_id = $1 AND name = $2`,
        [guildId, name]
      );
      
      if (embeds.length === 0) {
        return null;
      }
      
      // Get the fields
      const fields = await this.getCustomEmbedFields(embeds[0].id);
      
      // Combine them
      return {
        ...embeds[0],
        fields
      };
    } catch (error) {
      logger.error(`Error getting custom embed by name: ${error}`);
      return null;
    }
  }
  
  /**
   * Gets all custom embeds for a guild
   */
  public async getCustomEmbedsByGuild(guildId: string): Promise<CustomEmbed[]> {
    try {
      return await this.query<CustomEmbed>(
        `SELECT * FROM custom_embeds WHERE guild_id = $1 ORDER BY name`,
        [guildId]
      );
    } catch (error) {
      logger.error(`Error getting custom embeds by guild: ${error}`);
      return [];
    }
  }
  
  /**
   * Updates a custom embed
   */
  public async updateCustomEmbed(
    id: string,
    options: Partial<Omit<CustomEmbed, 'id' | 'guild_id' | 'creator_id' | 'created_at' | 'updated_at'>>
  ): Promise<CustomEmbed | null> {
    try {
      // Build the SET clause dynamically based on provided options
      const updates: string[] = [];
      const values: any[] = [];
      let paramCounter = 1;
      
      if (options.name !== undefined) {
        updates.push(`name = $${paramCounter++}`);
        values.push(options.name);
      }
      
      if (options.title !== undefined) {
        updates.push(`title = $${paramCounter++}`);
        values.push(options.title);
      }
      
      if (options.description !== undefined) {
        updates.push(`description = $${paramCounter++}`);
        values.push(options.description);
      }
      
      if (options.color !== undefined) {
        updates.push(`color = $${paramCounter++}`);
        values.push(options.color);
      }
      
      if (options.thumbnail !== undefined) {
        updates.push(`thumbnail = $${paramCounter++}`);
        values.push(options.thumbnail);
      }
      
      if (options.image !== undefined) {
        updates.push(`image = $${paramCounter++}`);
        values.push(options.image);
      }
      
      if (options.footer !== undefined) {
        updates.push(`footer = $${paramCounter++}`);
        values.push(options.footer);
      }
      
      if (options.timestamp !== undefined) {
        updates.push(`timestamp = $${paramCounter++}`);
        values.push(options.timestamp);
      }
      
      if (options.author_name !== undefined) {
        updates.push(`author_name = $${paramCounter++}`);
        values.push(options.author_name);
      }
      
      if (options.author_icon_url !== undefined) {
        updates.push(`author_icon_url = $${paramCounter++}`);
        values.push(options.author_icon_url);
      }
      
      if (options.author_url !== undefined) {
        updates.push(`author_url = $${paramCounter++}`);
        values.push(options.author_url);
      }
      
      // Always update the updated_at timestamp
      updates.push(`updated_at = NOW()`);
      
      // If no updates, return the original embed
      if (updates.length === 0) {
        return await this.getCustomEmbedById(id);
      }
      
      // Add the ID parameter
      values.push(id);
      
      // Execute the update
      const result = await this.query<CustomEmbed>(
        `UPDATE custom_embeds SET ${updates.join(', ')} WHERE id = $${paramCounter} RETURNING *`,
        values
      );
      
      if (result.length === 0) {
        return null;
      }
      
      logger.info(`Updated custom embed: ${result[0].name} (${id})`);
      return result[0];
    } catch (error) {
      logger.error(`Error updating custom embed: ${error}`);
      return null;
    }
  }
  
  /**
   * Deletes a custom embed
   */
  public async deleteCustomEmbed(id: string): Promise<void> {
    try {
      // Get the embed first to log it
      const embed = await this.getCustomEmbedById(id);
      
      if (!embed) {
        throw new Error(`Custom embed ${id} not found`);
      }
      
      // Delete it (the fields will cascade delete due to foreign key constraint)
      await this.query(
        `DELETE FROM custom_embeds WHERE id = $1`,
        [id]
      );
      
      logger.info(`Deleted custom embed: ${embed.name} (${id})`);
    } catch (error) {
      logger.error(`Error deleting custom embed: ${error}`);
      throw new Error(`Failed to delete custom embed: ${error}`);
    }
  }
  
  /**
   * Adds a field to a custom embed
   */
  public async addCustomEmbedField(
    embedId: string,
    name: string,
    value: string,
    inline: boolean = false,
    position: number = 0
  ): Promise<CustomEmbedField> {
    try {
      // Generate a UUID for the field
      const uuid = await this.query<{ uuid: string }>('SELECT uuid_generate_v4() as uuid');
      const id = uuid[0].uuid;
      
      // Insert the field
      const result = await this.query<CustomEmbedField>(
        `INSERT INTO custom_embed_fields 
        (id, embed_id, name, value, inline, position) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *`,
        [id, embedId, name, value, inline, position]
      );
      
      logger.info(`Added field "${name}" to custom embed ${embedId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error adding custom embed field: ${error}`);
      throw new Error(`Failed to add custom embed field: ${error}`);
    }
  }
  
  /**
   * Updates a custom embed field
   */
  public async updateCustomEmbedField(
    fieldId: string,
    options: Partial<Omit<CustomEmbedField, 'id' | 'embed_id' | 'created_at'>>
  ): Promise<CustomEmbedField | null> {
    try {
      // Build the SET clause dynamically based on provided options
      const updates: string[] = [];
      const values: any[] = [];
      let paramCounter = 1;
      
      if (options.name !== undefined) {
        updates.push(`name = $${paramCounter++}`);
        values.push(options.name);
      }
      
      if (options.value !== undefined) {
        updates.push(`value = $${paramCounter++}`);
        values.push(options.value);
      }
      
      if (options.inline !== undefined) {
        updates.push(`inline = $${paramCounter++}`);
        values.push(options.inline);
      }
      
      if (options.position !== undefined) {
        updates.push(`position = $${paramCounter++}`);
        values.push(options.position);
      }
      
      // If no updates, return null
      if (updates.length === 0) {
        return null;
      }
      
      // Add the ID parameter
      values.push(fieldId);
      
      // Execute the update
      const result = await this.query<CustomEmbedField>(
        `UPDATE custom_embed_fields SET ${updates.join(', ')} WHERE id = $${paramCounter} RETURNING *`,
        values
      );
      
      if (result.length === 0) {
        return null;
      }
      
      logger.info(`Updated custom embed field: ${fieldId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error updating custom embed field: ${error}`);
      return null;
    }
  }
  
  /**
   * Removes a field from a custom embed
   */
  public async removeCustomEmbedField(fieldId: string): Promise<void> {
    try {
      await this.query(
        `DELETE FROM custom_embed_fields WHERE id = $1`,
        [fieldId]
      );
      
      logger.info(`Removed custom embed field: ${fieldId}`);
    } catch (error) {
      logger.error(`Error removing custom embed field: ${error}`);
      throw new Error(`Failed to remove custom embed field: ${error}`);
    }
  }
  
  /**
   * Gets all fields for a custom embed
   */
  public async getCustomEmbedFields(embedId: string): Promise<CustomEmbedField[]> {
    try {
      return await this.query<CustomEmbedField>(
        `SELECT * FROM custom_embed_fields 
         WHERE embed_id = $1 
         ORDER BY position ASC`,
        [embedId]
      );
    } catch (error) {
      logger.error(`Error getting custom embed fields: ${error}`);
      return [];
    }
  }

  // Guild settings methods
  public async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    try {
      const result = await this.query<GuildSettings>(
        `SELECT * FROM guild_settings WHERE guild_id = $1`,
        [guildId]
      );
      
      if (result.length === 0) {
        // First, ensure the guild exists in the guilds table with a name and owner_id
        await this.query(
          `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [guildId, `Server ${guildId}`, '0']  // Use '0' as a placeholder owner_id
        );
        
        // Create empty settings record if it doesn't exist
        await this.query(
          `INSERT INTO guild_settings (guild_id) VALUES ($1)
           ON CONFLICT (guild_id) DO NOTHING`,
          [guildId]
        );
        
        const newResult = await this.query<GuildSettings>(
          `SELECT * FROM guild_settings WHERE guild_id = $1`,
          [guildId]
        );
        
        return newResult.length > 0 ? newResult[0] : null;
      }
      
      return result[0];
    } catch (error) {
      logger.error(`Error getting guild settings: ${error}`);
      return null;
    }
  }

  public async updateGuildSetting(guildId: string, setting: string, value: any): Promise<GuildSettings> {
    try {
      // Ensure the setting column exists
      const validColumns = ['prefix', 'mod_role_id', 'admin_role_id', 'mute_role_id', 
                           'log_channel_id', 'welcome_channel_id', 'welcome_message', 'farewell_message', 'lfg_channel_id'];
      
      if (!validColumns.includes(setting)) {
        throw new Error(`Invalid setting: ${setting}`);
      }
      
      // First, ensure the guild exists in the guilds table with a name and owner_id
      await this.query(
        `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [guildId, `Server ${guildId}`, '0']  // Use '0' as a placeholder owner_id
      );
      
      // Then ensure the guild_settings record exists
      await this.query(
        `INSERT INTO guild_settings (guild_id) VALUES ($1)
         ON CONFLICT (guild_id) DO NOTHING`,
        [guildId]
      );
      
      const query = `
        UPDATE guild_settings
        SET ${setting} = $1, updated_at = NOW()
        WHERE guild_id = $2
        RETURNING *
      `;
      
      const result = await this.query<GuildSettings>(query, [value, guildId]);
      
      if (result.length === 0) {
        throw new Error(`Guild settings not found for guild: ${guildId}`);
      }
      
      logger.info(`Updated guild setting: ${setting} for guild ${guildId}`);
      return result[0];
    } catch (error) {
      logger.error(`Error updating guild setting: ${error}`);
      throw error;
    }
  }

  // Welcome channel methods
  public async setWelcomeChannel(guildId: string, channelId: string): Promise<void> {
    try {
      await this.updateGuildSetting(guildId, 'welcome_channel_id', channelId);
      logger.info(`Set welcome channel for guild ${guildId} to ${channelId}`);
    } catch (error) {
      logger.error('Error setting welcome channel:', error);
      throw error;
    }
  }

  public async getWelcomeChannel(guildId: string): Promise<string | null> {
    try {
      const settings = await this.getGuildSettings(guildId);
      return settings?.welcome_channel_id || null;
    } catch (error) {
      logger.error('Error getting welcome channel:', error);
      return null;
    }
  }

  // Log settings methods
  public async getLogSettings(guildId: string): Promise<LogSettings | null> {
    try {
      const result = await this.query<LogSettings>(
        `SELECT * FROM log_settings WHERE guild_id = $1`,
        [guildId]
      );
      
      if (result.length === 0) {
        // First, ensure the guild exists in the guilds table with a name and owner_id
        await this.query(
          `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [guildId, `Server ${guildId}`, '0']  // Use '0' as a placeholder owner_id
        );
        
        // Create default log settings for this guild
        await this.query(
          `INSERT INTO log_settings (guild_id) VALUES ($1)
           ON CONFLICT (guild_id) DO NOTHING`,
          [guildId]
        );
        
        const newResult = await this.query<LogSettings>(
          `SELECT * FROM log_settings WHERE guild_id = $1`,
          [guildId]
        );
        
        return newResult.length > 0 ? newResult[0] : null;
      }
      
      return result[0];
    } catch (error) {
      logger.error(`Error getting log settings: ${error}`);
      return null;
    }
  }

  public async updateLogSetting(guildId: string, setting: keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>, value: boolean): Promise<boolean> {
    try {
      // Ensure guild exists in guilds table
      await this.query(
        `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [guildId, `Server ${guildId}`, '0']
      );
      
      // Ensure log settings entry exists
      await this.query(
        `INSERT INTO log_settings (guild_id) VALUES ($1)
         ON CONFLICT (guild_id) DO NOTHING`,
        [guildId]
      );
      
      // Update the specific setting
      await this.query(
        `UPDATE log_settings SET ${setting} = $1, updated_at = NOW() WHERE guild_id = $2`,
        [value, guildId]
      );
      
      return true;
    } catch (error) {
      logger.error(`Error updating log setting ${setting} for guild ${guildId}: ${error}`);
      return false;
    }
  }

  public async isLogTypeEnabled(guildId: string, logType: keyof Omit<LogSettings, 'guild_id' | 'created_at' | 'updated_at'>): Promise<boolean> {
    try {
      const settings = await this.getLogSettings(guildId);
      if (!settings) return true; // Default to enabled if settings not found
      
      return settings[logType];
    } catch (error) {
      logger.error(`Error checking if log type ${logType} is enabled for guild ${guildId}: ${error}`);
      return true; // Default to enabled on error
    }
  }

  /**
   * Deletes inactive warnings older than the specified number of days
   * @param olderThanDays Warnings older than this many days will be deleted
   * @returns The number of warnings deleted
   */
  public async deleteInactiveWarnings(olderThanDays: number = 30): Promise<number> {
    try {
      logger.db(`Deleting inactive warnings older than ${olderThanDays} days`);
      
      const result = await this.query<{ id: number }>(
        `DELETE FROM warnings 
         WHERE active = false AND created_at < NOW() - INTERVAL '${olderThanDays} days'
         RETURNING id`
      );
      
      const count = result.length;
      logger.info(`Deleted ${count} inactive warnings older than ${olderThanDays} days`);
      
      return count;
    } catch (error) {
      logger.error(`Error deleting inactive warnings: ${error}`);
      throw new Error(`Failed to delete inactive warnings: ${error}`);
    }
  }

  /**
   * Deletes ended giveaways older than the specified number of days
   * @param olderThanDays Giveaways ended more than this many days ago will be deleted
   * @returns The number of giveaways deleted
   */
  public async deleteOldGiveaways(olderThanDays: number = 7): Promise<number> {
    try {
      logger.db(`Deleting ended giveaways older than ${olderThanDays} days`);
      
      const result = await this.query<{ id: string }>(
        `DELETE FROM giveaways 
         WHERE ended = true AND ends_at < NOW() - INTERVAL '${olderThanDays} days'
         RETURNING id`
      );
      
      const count = result.length;
      logger.info(`Deleted ${count} ended giveaways older than ${olderThanDays} days`);
      
      return count;
    } catch (error) {
      logger.error(`Error deleting old giveaways: ${error}`);
      throw new Error(`Failed to delete old giveaways: ${error}`);
    }
  }

  /**
   * Deletes closed LFG sessions older than the specified number of days
   * @param olderThanDays LFG sessions closed more than this many days ago will be deleted
   * @returns The number of LFG sessions deleted
   */
  public async deleteOldLfgSessions(olderThanDays: number = 7): Promise<number> {
    try {
      logger.db(`Deleting closed LFG sessions older than ${olderThanDays} days`);
      
      const result = await this.query<{ id: string }>(
        `DELETE FROM lfg_sessions 
         WHERE status = 'CLOSED' AND updated_at < NOW() - INTERVAL '${olderThanDays} days'
         RETURNING id`
      );
      
      const count = result.length;
      logger.info(`Deleted ${count} closed LFG sessions older than ${olderThanDays} days`);
      
      return count;
    } catch (error) {
      logger.error(`Error deleting old LFG sessions: ${error}`);
      throw new Error(`Failed to delete old LFG sessions: ${error}`);
    }
  }

  /**
   * Gets a custom embed's fields by embed ID
   */
  public async getCustomEmbedFieldsById(embedId: string): Promise<CustomEmbedField[]> {
    try {
      const queryText = `
        SELECT * FROM custom_embed_fields
        WHERE embed_id = $1
        ORDER BY position ASC
      `;

      const fields = await this.query<CustomEmbedField>(queryText, [embedId]);
      return fields;
    } catch (error) {
      logger.error(`Error getting custom embed fields:`, error);
      throw error;
    }
  }

  /**
   * Creates a new giveaway
   */
  public async createGiveaway(
    guildId: string,
    channelId: string,
    creatorId: string,
    prize: string,
    description: string | null,
    winnersCount: number,
    requirement: string | null,
    endsAt: Date
  ): Promise<Giveaway> {
    try {
      // Ensure guild exists in guilds table
      await this.query(
        `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [guildId, `Server ${guildId}`, '0']  // Use '0' as a placeholder owner_id
      );
      
      const queryText = `
        INSERT INTO giveaways (
          guild_id, channel_id, creator_id, prize, description,
          winners_count, requirement, ends_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const giveaway = await this.query<Giveaway>(
        queryText,
        [guildId, channelId, creatorId, prize, description, winnersCount, requirement, endsAt]
      );

      // Initialize with 0 participants
      const result = {
        ...giveaway[0],
        participants_count: 0,
        winners: [] as string[]
      };

      return result;
    } catch (error) {
      logger.error('Error creating giveaway:', error);
      throw error;
    }
  }

  /**
   * Sets the message ID for a giveaway after it's been sent
   */
  public async setGiveawayMessageId(giveawayId: string, messageId: string): Promise<void> {
    try {
      await this.query(
        'UPDATE giveaways SET message_id = $1 WHERE id = $2',
        [messageId, giveawayId]
      );
    } catch (error) {
      logger.error(`Error setting giveaway message ID:`, error);
      throw error;
    }
  }

  /**
   * Gets a giveaway by its ID with participant count and winners
   */
  public async getGiveawayById(giveawayId: string): Promise<Giveaway | null> {
    try {
      // Get the giveaway
      const giveawayQuery = 'SELECT * FROM giveaways WHERE id = $1';
      const giveaways = await this.query<Giveaway>(giveawayQuery, [giveawayId]);
      
      if (giveaways.length === 0) {
        return null;
      }
      
      const giveaway = giveaways[0];
      
      // Get participant count
      const participantCountQuery = 'SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = $1';
      const participantCountResult = await this.query<{count: string}>(participantCountQuery, [giveawayId]);
      const participantsCount = parseInt(participantCountResult[0].count, 10);
      
      // Get winners if the giveaway has ended
      let winners: string[] = [];
      if (giveaway.ended) {
        const winnersQuery = 'SELECT user_id FROM giveaway_entries WHERE giveaway_id = $1 AND is_winner = true';
        const winnersResult = await this.query<{user_id: string}>(winnersQuery, [giveawayId]);
        winners = winnersResult.map(row => row.user_id);
      }
      
      // Return combined result
      return {
        ...giveaway,
        participants_count: participantsCount,
        winners
      };
    } catch (error) {
      logger.error(`Error getting giveaway by ID:`, error);
      throw error;
    }
  }

  /**
   * Gets a giveaway by its message ID with participant count and winners
   */
  public async getGiveawayByMessageId(messageId: string): Promise<Giveaway | null> {
    try {
      // Get the giveaway
      const giveawayQuery = 'SELECT * FROM giveaways WHERE message_id = $1';
      const giveaways = await this.query<Giveaway>(giveawayQuery, [messageId]);
      
      if (giveaways.length === 0) {
        return null;
      }
      
      // Use getGiveawayById to fetch complete data
      return await this.getGiveawayById(giveaways[0].id);
    } catch (error) {
      logger.error(`Error getting giveaway by message ID:`, error);
      throw error;
    }
  }

  /**
   * Gets active giveaways for a guild with participant counts
   */
  public async getActiveGiveawaysForGuild(guildId: string): Promise<Giveaway[]> {
    try {
      // Get all active giveaways
      const giveawaysQuery = `
        SELECT * FROM giveaways 
        WHERE guild_id = $1 AND ended = false
        ORDER BY ends_at ASC
      `;
      const giveaways = await this.query<Giveaway>(giveawaysQuery, [guildId]);
      
      if (giveaways.length === 0) {
        return [];
      }
      
      // Get participant counts for all giveaways in a single query
      const giveawayIds = giveaways.map(g => g.id);
      const placeholders = giveawayIds.map((_, i) => `$${i + 1}`).join(',');
      
      const countsQuery = `
        SELECT giveaway_id, COUNT(*) as count 
        FROM giveaway_entries 
        WHERE giveaway_id IN (${placeholders})
        GROUP BY giveaway_id
      `;
      
      const countsResult = await this.query<{giveaway_id: string, count: string}>(
        countsQuery, 
        giveawayIds
      );
      
      // Map counts to giveaways
      const countsMap = new Map<string, number>();
      countsResult.forEach(row => {
        countsMap.set(row.giveaway_id, parseInt(row.count, 10));
      });
      
      // Return giveaways with counts
      return giveaways.map(giveaway => ({
        ...giveaway,
        participants_count: countsMap.get(giveaway.id) || 0,
        winners: [] as string[]
      }));
    } catch (error) {
      logger.error(`Error getting active giveaways for guild:`, error);
      throw error;
    }
  }

  /**
   * Gets all giveaways that should end now (their end time has passed)
   */
  public async getGiveawaysToEnd(): Promise<Giveaway[]> {
    try {
      const queryText = `
        SELECT * FROM giveaways 
        WHERE ended = false AND ends_at <= NOW()
      `;
      const giveaways = await this.query<Giveaway>(queryText, []);
      
      // No need to include participant counts for this use case
      return giveaways.map(giveaway => ({
        ...giveaway,
        participants_count: 0,
        winners: [] as string[]
      }));
    } catch (error) {
      logger.error(`Error getting giveaways to end:`, error);
      throw error;
    }
  }

  /**
   * Adds a participant to a giveaway
   */
  public async addGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean> {
    try {
      // Check if giveaway exists and hasn't ended
      const giveaway = await this.getGiveawayById(giveawayId);
      
      if (!giveaway || giveaway.ended) {
        return false;
      }
      
      // Insert new entry
      const queryText = `
        INSERT INTO giveaway_entries (giveaway_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (giveaway_id, user_id) DO NOTHING
        RETURNING id
      `;
      
      const result = await this.query(queryText, [giveawayId, userId]);
      return result.length > 0;
    } catch (error) {
      logger.error(`Error adding giveaway participant:`, error);
      throw error;
    }
  }

  /**
   * Removes a participant from a giveaway
   */
  public async removeGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean> {
    try {
      // Check if giveaway exists and hasn't ended
      const giveaway = await this.getGiveawayById(giveawayId);
      
      if (!giveaway || giveaway.ended) {
        return false;
      }
      
      // Delete the entry
      const queryText = `
        DELETE FROM giveaway_entries
        WHERE giveaway_id = $1 AND user_id = $2
        RETURNING id
      `;
      
      const result = await this.query(queryText, [giveawayId, userId]);
      return result.length > 0;
    } catch (error) {
      logger.error(`Error removing giveaway participant:`, error);
      throw error;
    }
  }

  /**
   * Checks if a user is a participant in a giveaway
   */
  public async isGiveawayParticipant(giveawayId: string, userId: string): Promise<boolean> {
    try {
      const queryText = `
        SELECT id FROM giveaway_entries
        WHERE giveaway_id = $1 AND user_id = $2
        LIMIT 1
      `;
      
      const result = await this.query(queryText, [giveawayId, userId]);
      return result.length > 0;
    } catch (error) {
      logger.error(`Error checking giveaway participant:`, error);
      throw error;
    }
  }

  /**
   * End a giveaway and pick winners
   * @param giveawayId The ID of the giveaway to end
   * @returns An array of winner user IDs
   */
  public async endGiveaway(giveawayId: string): Promise<string[]> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the giveaway with participant count
      const giveawayQuery = `
        SELECT g.*, COUNT(ge.user_id) AS participants_count
        FROM giveaways g
        LEFT JOIN giveaway_entries ge ON g.id = ge.giveaway_id
        WHERE g.id = $1
        GROUP BY g.id
      `;
      
      const giveawayResult = await client.query(giveawayQuery, [giveawayId]);
      if (giveawayResult.rows.length === 0) {
        throw new Error('Giveaway not found');
      }
      
      const giveaway = giveawayResult.rows[0];
      
      // Update the giveaway to mark it as ended
      await client.query(
        'UPDATE giveaways SET ended = true WHERE id = $1',
        [giveawayId]
      );
      
      // Select random winners using efficient PostgreSQL query
      const winnersQuery = `
        UPDATE giveaway_entries
        SET is_winner = true
        WHERE id IN (
          SELECT id FROM giveaway_entries
          WHERE giveaway_id = $1
          ORDER BY random()
          LIMIT $2
        )
        RETURNING user_id
      `;
      
      const winnersResult = await client.query(winnersQuery, [
        giveawayId,
        giveaway.winners_count
      ]);
      
      // Get the list of winner IDs
      const winners = winnersResult.rows.map(row => row.user_id);
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return winners;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error ending giveaway:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reroll winners for a giveaway
   * @param giveawayId The ID of the giveaway
   * @param winnersCount Optional number of winners to select (defaults to original winners count)
   * @returns An array of winner user IDs
   */
  public async rerollGiveaway(giveawayId: string, winnersCount?: number): Promise<string[]> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the giveaway with participant count
      const giveawayQuery = `
        SELECT g.*, COUNT(ge.user_id) AS participants_count
        FROM giveaways g
        LEFT JOIN giveaway_entries ge ON g.id = ge.giveaway_id
        WHERE g.id = $1
        GROUP BY g.id
      `;
      
      const giveawayResult = await client.query(giveawayQuery, [giveawayId]);
      if (giveawayResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Giveaway not found');
      }
      
      const giveaway = giveawayResult.rows[0];
      
      // Check if the giveaway has participants
      const participantsCountQuery = `
        SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = $1
      `;
      const participantsResult = await client.query(participantsCountQuery, [giveawayId]);
      const participantsCount = parseInt(participantsResult.rows[0].count);
      
      if (participantsCount === 0) {
        await client.query('ROLLBACK');
        return [];
      }

      // Get current winners to exclude them
      const currentWinnersQuery = `
        SELECT user_id FROM giveaway_entries 
        WHERE giveaway_id = $1 AND is_winner = true
      `;
      const currentWinnersResult = await client.query(currentWinnersQuery, [giveawayId]);
      const currentWinners = currentWinnersResult.rows.map(row => row.user_id);
      
      // Reset previous winners
      await client.query(
        'UPDATE giveaway_entries SET is_winner = false WHERE giveaway_id = $1',
        [giveawayId]
      );
      
      // Use the specified winners count or the original one
      const actualWinnersCount = winnersCount || giveaway.winners_count;
      
      // Limit the number of winners to the number of participants
      const limitedWinnersCount = Math.min(actualWinnersCount, participantsCount);
      
      if (limitedWinnersCount === 0) {
        await client.query('COMMIT');
        return [];
      }
      
      // Get random participants, excluding previous winners unless there's only one participant
      let winnersQuery;
      let queryParams;
      
      if (participantsCount <= 1 || currentWinners.length === 0) {
        // If only one participant or no previous winners, select from all participants
        winnersQuery = `
          UPDATE giveaway_entries
          SET is_winner = true
          WHERE id IN (
            SELECT id FROM giveaway_entries
            WHERE giveaway_id = $1
            ORDER BY random()
            LIMIT $2
          )
          RETURNING user_id
        `;
        queryParams = [giveawayId, limitedWinnersCount];
      } else {
        // Exclude previous winners
        winnersQuery = `
          UPDATE giveaway_entries
          SET is_winner = true
          WHERE id IN (
            SELECT id FROM giveaway_entries
            WHERE giveaway_id = $1
            AND user_id NOT IN (${currentWinners.map((_, i) => `$${i + 3}`).join(',')})
            ORDER BY random()
            LIMIT $2
          )
          RETURNING user_id
        `;
        queryParams = [giveawayId, limitedWinnersCount, ...currentWinners];
      }
      
      const winnersResult = await client.query(winnersQuery, queryParams);
      
      // If we couldn't find enough new winners (because most participants already won),
      // we need to select from all participants to fill the remaining slots
      if (winnersResult.rows.length < limitedWinnersCount) {
        const remainingCount = limitedWinnersCount - winnersResult.rows.length;
        const remainingWinnersQuery = `
          UPDATE giveaway_entries
          SET is_winner = true
          WHERE id IN (
            SELECT id FROM giveaway_entries
            WHERE giveaway_id = $1
            AND is_winner = false
            ORDER BY random()
            LIMIT $2
          )
          RETURNING user_id
        `;
        
        const remainingWinnersResult = await client.query(remainingWinnersQuery, [
          giveawayId, 
          remainingCount
        ]);
        
        // Combine the winners
        const winners = [
          ...winnersResult.rows.map(row => row.user_id),
          ...remainingWinnersResult.rows.map(row => row.user_id)
        ];
        
        // Update the giveaway with the new winners count if it changed
        if (winnersCount && winnersCount !== giveaway.winners_count) {
          await client.query(
            'UPDATE giveaways SET winners_count = $1 WHERE id = $2',
            [limitedWinnersCount, giveawayId]
          );
        }
        
        // Commit the transaction
        await client.query('COMMIT');
        
        return winners;
      }
      
      // Get the list of winner IDs
      const winners = winnersResult.rows.map(row => row.user_id);
      
      // Update the giveaway with the new winners count if it changed
      if (winnersCount && winnersCount !== giveaway.winners_count) {
        await client.query(
          'UPDATE giveaways SET winners_count = $1 WHERE id = $2',
          [limitedWinnersCount, giveawayId]
        );
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return winners;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error rerolling giveaway:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deletes a giveaway and all its entries
   */
  public async deleteGiveaway(giveawayId: string): Promise<boolean> {
    try {
      // The ON DELETE CASCADE will automatically delete all entries
      const result = await this.query(
        'DELETE FROM giveaways WHERE id = $1 RETURNING id',
        [giveawayId]
      );
      
      return result.length > 0;
    } catch (error) {
      logger.error(`Error deleting giveaway:`, error);
      throw error;
    }
  }

  /**
   * Get expired giveaways that need to be processed
   */
  public async getExpiredGiveaways(): Promise<Giveaway[]> {
    try {
      const now = new Date();
      // Look for giveaways that have ended or will end within 1 second
      const futureThreshold = new Date(now.getTime() + 1000);
      
      const query = `
        SELECT g.*, 
               COUNT(ge.user_id) AS participants_count,
               array_agg(CASE WHEN ge.is_winner THEN ge.user_id ELSE NULL END) FILTER (WHERE ge.is_winner) AS winners
        FROM giveaways g
        LEFT JOIN giveaway_entries ge ON g.id = ge.giveaway_id
        WHERE g.ended = false AND g.ends_at <= $1
        GROUP BY g.id
        ORDER BY g.ends_at ASC
      `;
      
      // Use executeWithRetry for better connection handling
      const result = await this.executeWithRetry(async () => {
        const res = await this.pool.query(query, [futureThreshold]);
        return res.rows;
      }, 'getExpiredGiveaways');
      
      return result.map(row => ({
        id: row.id,
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        message_id: row.message_id,
        host_id: row.host_id,
        prize: row.prize,
        description: row.description,
        winners_count: row.winners_count,
        requirement: row.requirement,
        ends_at: row.ends_at,
        ended: row.ended,
        created_at: row.created_at,
        creator_id: row.host_id,
        participants_count: parseInt(row.participants_count || '0'),
        winners: row.winners?.filter(Boolean) || [] as string[]
      }));
    } catch (error) {
      logger.error('Error fetching expired giveaways:', error);
      return [];
    }
  }

  // LFG Session methods
  public async createLfgSession(
    guildId: string,
    channelId: string,
    threadId: string,
    messageId: string,
    hostId: string,
    missionName: string
  ): Promise<LfgSession | null> {
    try {
      // Ensure guild exists in guilds table
      await this.query(
        `INSERT INTO guilds (id, name, owner_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [guildId, `Server ${guildId}`, '0']  // Use '0' as a placeholder owner_id
      );
      
      const result = await this.query<LfgSession>(
        `INSERT INTO lfg_sessions
          (guild_id, channel_id, thread_id, message_id, host_id, mission_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [guildId, channelId, threadId, messageId, hostId, missionName]
      );
      
      if (result.length === 0) {
        return null;
      }
      
      logger.info(`Created LFG session: ${result[0].id} for mission: ${missionName}`);
      return result[0];
    } catch (error) {
      logger.error(`Error creating LFG session: ${error}`);
      return null;
    }
  }

  public async getLfgSession(threadId: string): Promise<LfgSession | null> {
    try {
      const result = await this.query<LfgSession>(
        `SELECT * FROM lfg_sessions WHERE thread_id = $1`,
        [threadId]
      );
      
      if (result.length === 0) {
        return null;
      }
      
      return result[0];
    } catch (error) {
      logger.error(`Error getting LFG session: ${error}`);
      return null;
    }
  }

  public async updateLfgSessionStatus(
    sessionId: string,
    status: 'OPEN' | 'FULL' | 'CLOSED',
    playerCount?: number
  ): Promise<boolean> {
    try {
      logger.info(`Updating LFG session ${sessionId} status to ${status}${playerCount !== undefined ? ` with player count ${playerCount}` : ''}`);
      
      // First, get the current session to check its state
      const currentSession = await this.query<LfgSession>(
        `SELECT * FROM lfg_sessions WHERE id = $1`,
        [sessionId]
      );
      
      if (currentSession.length === 0) {
        logger.warn(`No session found with ID ${sessionId} to update status`);
        return false;
      }
      
      logger.info(`Current session state: status=${currentSession[0].status}, player_count=${currentSession[0].player_count}`);
      
      let query = `
        UPDATE lfg_sessions
        SET status = $1, updated_at = NOW()
      `;
      
      const params: any[] = [status];
      
      // Always set player count to max (4) when setting status to FULL
      if (status === 'FULL') {
        if (playerCount === undefined) {
          playerCount = 4; // Force player_count to 4 when marking as FULL
        }
        query += `, player_count = $${params.length + 1}`;
        params.push(playerCount);
      } else if (playerCount !== undefined) {
        query += `, player_count = $${params.length + 1}`;
        params.push(playerCount);
      }
      
      if (status === 'CLOSED') {
        query += `, closed_at = NOW()`;
      }
      
      query += ` WHERE id = $${params.length + 1} RETURNING *`;
      params.push(sessionId);
      
      const result = await this.query<LfgSession>(query, params);
      
      if (result.length === 0) {
        logger.warn(`No session found with ID ${sessionId} to update status (in final query)`);
        return false;
      }
      
      logger.info(`Successfully updated LFG session ${sessionId} status to ${status} (player count: ${result[0].player_count})`);
      return true;
    } catch (error) {
      logger.error(`Error updating LFG session status: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public async updateLfgPlayerCount(sessionId: string, playerCount: number): Promise<boolean> {
    try {
      logger.info(`Updating LFG session ${sessionId} player count to ${playerCount}`);
      
      // CRITICAL: If player count is 4, always force status to FULL
      if (playerCount >= 4) {
        // Get current session first
        const currentSession = await this.query<LfgSession>(
          `SELECT * FROM lfg_sessions WHERE id = $1`,
          [sessionId]
        );
        
        if (currentSession.length > 0) {
          logger.info(`Setting session ${sessionId} to FULL because player count is ${playerCount}`);
          
          // Force status to FULL with direct query
          const result = await this.query<LfgSession>(
            `UPDATE lfg_sessions
             SET player_count = 4, status = 'FULL', updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [sessionId]
          );
          
          if (result.length > 0) {
            logger.info(`Successfully forced LFG session ${sessionId} to FULL with player count 4`);
            return true;
          }
        }
      }
      
      // Regular update for non-full player counts
      const result = await this.query<LfgSession>(
        `UPDATE lfg_sessions
         SET player_count = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [playerCount, sessionId]
      );
      
      if (result.length === 0) {
        logger.warn(`No session found with ID ${sessionId} to update player count`);
        return false;
      }
      
      logger.info(`Successfully updated LFG session ${sessionId} player count to ${playerCount} (max: ${result[0].max_players}, status: ${result[0].status})`);
      
      // If player count is max, update status to FULL
      if (playerCount >= result[0].max_players && result[0].status === 'OPEN') {
        logger.info(`Player count (${playerCount}) reached max (${result[0].max_players}), updating status to FULL`);
        await this.updateLfgSessionStatus(sessionId, 'FULL');
      }
      
      return true;
    } catch (error) {
      logger.error(`Error updating LFG player count: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public async addLfgParticipant(sessionId: string, userId: string): Promise<boolean> {
    try {
      // Check if participant already exists for this session
      const existingParticipant = await this.query<LfgParticipant>(
        `SELECT * FROM lfg_participants WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId]
      );
      
      if (existingParticipant.length > 0) {
        return true; // Already participating
      }
      
      // Add participant
      await this.query(
        `INSERT INTO lfg_participants (session_id, user_id)
         VALUES ($1, $2)`,
        [sessionId, userId]
      );
      
      logger.info(`Added participant ${userId} to LFG session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Error adding LFG participant: ${error}`);
      return false;
    }
  }

  public async getCompletedLfgCount(userId: string, guildId?: string): Promise<number> {
    try {
      let query = `
        SELECT COUNT(DISTINCT session_id) as count
        FROM lfg_participants p
        JOIN lfg_sessions s ON p.session_id = s.id
        WHERE p.user_id = $1
        AND s.status = 'CLOSED'
      `;
      
      const params: any[] = [userId];
      
      if (guildId) {
        query += ` AND s.guild_id = $2`;
        params.push(guildId);
      }
      
      const result = await this.query<{ count: string }>(query, params);
      
      if (result.length === 0) {
        return 0;
      }
      
      return parseInt(result[0].count, 10) || 0;
    } catch (error) {
      logger.error(`Error getting completed LFG count: ${error}`);
      return 0;
    }
  }

  public async getLfgLeaderboard(guildId: string, limit?: number): Promise<Array<{ user_id: string, completed_count: number }>> {
    try {
      const actualLimit = limit || 10; // Default to 10 if not specified
      
      const result = await this.query<{ user_id: string, completed_count: string }>(
        `SELECT p.user_id, COUNT(DISTINCT p.session_id) as completed_count
         FROM lfg_participants p
         JOIN lfg_sessions s ON p.session_id = s.id
         WHERE s.guild_id = $1
         AND s.status = 'CLOSED'
         GROUP BY p.user_id
         ORDER BY completed_count DESC
         LIMIT $2`,
        [guildId, actualLimit]
      );
      
      return result.map(row => ({
        user_id: row.user_id,
        completed_count: parseInt(row.completed_count, 10) || 0
      }));
    } catch (error) {
      logger.error(`Error getting LFG leaderboard: ${error}`);
      return [];
    }
  }

  /**
   * Get LFG sessions that need to be cleaned up based on their status and age
   * @param fullThreadHours Hours to keep FULL threads before archiving (default: 1.5)
   * @param openThreadHours Hours to keep OPEN threads before archiving (default: 24)
   * @returns Array of LFG sessions that need cleanup
   */
  public async getLfgSessionsForCleanup(
    fullThreadHours: number = 1.5,
    openThreadHours: number = 24
  ): Promise<LfgSession[]> {
    try {
      // FULL/CLOSED threads get auto-archived after fullThreadHours (default 1.5 hours)
      // OPEN threads get auto-archived after openThreadHours (default 24 hours)
      const query = `
        SELECT * FROM lfg_sessions
        WHERE 
          (
            (status IN ('FULL', 'CLOSED') AND created_at < NOW() - INTERVAL '${fullThreadHours} hours')
            OR
            (status = 'OPEN' AND created_at < NOW() - INTERVAL '${openThreadHours} hours')
          )
          AND (closed_at IS NULL OR closed_at < NOW() - INTERVAL '${fullThreadHours} hours')
      `;
      
      const results = await this.query<LfgSession>(query);
      logger.db(`Found ${results.length} LFG sessions to clean up: ${results.map(s => s.id).join(', ')}`);
      
      return results;
    } catch (error) {
      logger.error(`Error getting LFG sessions for cleanup: ${error}`);
      return [];
    }
  }
  
  /**
   * Delete an LFG session from the database
   * @param sessionId The ID of the session to delete
   * @returns True if the session was deleted, false otherwise
   */
  public async deleteLfgSession(sessionId: string): Promise<boolean> {
    try {
      logger.db(`Deleting LFG session ${sessionId}`);
      
      // Delete the session
      const result = await this.query<LfgSession>(
        `DELETE FROM lfg_sessions WHERE id = $1 RETURNING *`,
        [sessionId]
      );
      
      if (result.length === 0) {
        logger.warn(`No LFG session found with ID ${sessionId} to delete`);
        return false;
      }
      
      logger.info(`Successfully deleted LFG session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting LFG session: ${error}`);
      return false;
    }
  }

  // ============= Warframe Notification Methods =============

  // Fissure Notifications
  async getFissureNotifications(): Promise<any[]> {
    const results = await this.query('SELECT * FROM fissure_notifications');
    return results;
  }

  async getFissureNotificationsByType(missionType: string, steelPath: boolean): Promise<any[]> {
    const results = await this.query(
      'SELECT * FROM fissure_notifications WHERE mission_type = $1 AND steel_path = $2',
      [missionType, steelPath]
    );
    return results;
  }

  async addFissureNotification(guildId: string, channelId: string, missionType: string, steelPath: boolean, roleId?: string): Promise<any> {
    const result = await this.query(
      `INSERT INTO fissure_notifications 
       (guild_id, channel_id, mission_type, steel_path, role_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [guildId, channelId, missionType, steelPath, roleId || null]
    );
    return result[0];
  }

  async updateFissureLastNotified(id: string, lastNotified: string): Promise<void> {
    await this.query(
      'UPDATE fissure_notifications SET last_notified = $1, updated_at = NOW() WHERE id = $2',
      [lastNotified, id]
    );
  }

  async updateFissureMessageId(id: string, messageId: string): Promise<void> {
    await this.query(
      'UPDATE fissure_notifications SET message_id = $1, updated_at = NOW() WHERE id = $2',
      [messageId, id]
    );
  }

  async removeFissureNotification(id: string): Promise<void> {
    await this.query('DELETE FROM fissure_notifications WHERE id = $1', [id]);
  }

  // Aya Notifications
  async getAyaNotifications(): Promise<any[]> {
    const results = await this.query('SELECT * FROM aya_notifications');
    return results;
  }

  async addAyaNotification(guildId: string, channelId: string, roleId?: string, messageId?: string): Promise<any> {
    const result = await this.query(
      `INSERT INTO aya_notifications 
       (guild_id, channel_id, role_id, message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [guildId, channelId, roleId || null, messageId || null]
    );
    return result[0];
  }

  async updateAyaMessageId(id: string, messageId: string): Promise<void> {
    await this.query(
      'UPDATE aya_notifications SET message_id = $1, updated_at = NOW() WHERE id = $2',
      [messageId, id]
    );
  }

  async removeAyaNotification(id: string): Promise<void> {
    await this.query('DELETE FROM aya_notifications WHERE id = $1', [id]);
  }

  // Baro Notifications
  async getBaroNotifications(): Promise<any[]> {
    const results = await this.query('SELECT * FROM baro_notifications');
    return results;
  }

  async addBaroNotification(guildId: string, channelId: string, roleId?: string, messageId?: string): Promise<any> {
    const result = await this.query(
      `INSERT INTO baro_notifications 
       (guild_id, channel_id, role_id, message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [guildId, channelId, roleId || null, messageId || null]
    );
    return result[0];
  }

  async updateBaroMessageId(id: string, messageId: string): Promise<void> {
    await this.query(
      'UPDATE baro_notifications SET message_id = $1, updated_at = NOW() WHERE id = $2',
      [messageId, id]
    );
  }

  async removeBaroNotification(id: string): Promise<void> {
    await this.query('DELETE FROM baro_notifications WHERE id = $1', [id]);
  }

  // Arbitration Notifications
  async getArbitrationNotifications(): Promise<any[]> {
    const results = await this.query('SELECT * FROM arbitration_notifications');
    return results;
  }

  async addArbitrationNotification(
    guildId: string, 
    channelId: string, 
    roleId?: string | null, 
    messageId?: string | null,
    sTierRoleId?: string | null,
    aTierRoleId?: string | null,
    bTierRoleId?: string | null,
    cTierRoleId?: string | null,
    dTierRoleId?: string | null,
    fTierRoleId?: string | null
  ): Promise<any> {
    const result = await this.query(
      `INSERT INTO arbitration_notifications 
       (guild_id, channel_id, role_id, message_id, s_tier_role_id, a_tier_role_id, b_tier_role_id, c_tier_role_id, d_tier_role_id, f_tier_role_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        guildId, 
        channelId, 
        roleId || null, 
        messageId || null,
        sTierRoleId || null,
        aTierRoleId || null,
        bTierRoleId || null,
        cTierRoleId || null,
        dTierRoleId || null,
        fTierRoleId || null
      ]
    );
    return result[0];
  }

  async updateArbitrationMessageId(id: string, messageId: string): Promise<void> {
    await this.query(
      'UPDATE arbitration_notifications SET message_id = $1, updated_at = NOW() WHERE id = $2',
      [messageId, id]
    );
  }

  async removeArbitrationNotification(id: string): Promise<void> {
    await this.query('DELETE FROM arbitration_notifications WHERE id = $1', [id]);
  }

  // PostgreSQL Incarnon notification handling
  async getIncarnonNotifications(): Promise<any[]> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM incarnon_notifications
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error getting Incarnon notifications:', error);
      return [];
    }
  }

  async getIncarnonNotificationByGuild(guildId: string): Promise<any> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM incarnon_notifications
        WHERE guild_id = $1
      `, [guildId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting Incarnon notification for guild ${guildId}:`, error);
      return null;
    }
  }

  async addIncarnonNotification(guildId: string, channelId: string, roleId: string | null): Promise<any> {
    try {
      const result = await this.pool.query(`
        INSERT INTO incarnon_notifications 
        (guild_id, channel_id, role_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [guildId, channelId, roleId]);
      
      return result.rows[0];
    } catch (error) {
      logger.error(`Error adding Incarnon notification for guild ${guildId}:`, error);
      throw error;
    }
  }

  async updateIncarnonNotification(id: string, channelId: string, roleId: string | null): Promise<boolean> {
    try {
      await this.pool.query(`
        UPDATE incarnon_notifications
        SET channel_id = $1, role_id = $2, updated_at = NOW()
        WHERE id = $3
      `, [channelId, roleId, id]);
      
      return true;
    } catch (error) {
      logger.error(`Error updating Incarnon notification ${id}:`, error);
      return false;
    }
  }

  async updateIncarnonMessageId(id: string, messageId: string): Promise<boolean> {
    try {
      await this.pool.query(`
        UPDATE incarnon_notifications
        SET message_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [messageId, id]);
      
      return true;
    } catch (error) {
      logger.error(`Error updating Incarnon notification message ID for ${id}:`, error);
      return false;
    }
  }

  async removeIncarnonNotification(guildId: string): Promise<boolean> {
    try {
      await this.pool.query(`
        DELETE FROM incarnon_notifications
        WHERE guild_id = $1
      `, [guildId]);
      
      return true;
    } catch (error) {
      logger.error(`Error removing Incarnon notification for guild ${guildId}:`, error);
      return false;
    }
  }
}

// Export the singleton instance
export const pgdb: PostgresClient | null = config.DATABASE_TYPE === 'postgres' 
  ? PostgresDatabase.getInstance() as unknown as PostgresClient
  : null;
