import { Client, Collection, Events, WebhookClient, ThreadChannel } from 'discord.js';
import { config, clientOptions } from './config/config';
import { loadEvents } from './utils/eventLoader';
import { loadCommands } from './utils/commandLoader';
import { logger } from './utils/logger';
import { Command } from './types/discord';
import { initDatabase } from './services/initDatabase';
import { initializeDictionaries } from './utils/dictionaryLoader';
import { Routes } from 'discord-api-types/v10';
import { getRestInstance } from './utils/restFactory';
import { initArbitrationService } from './services/arbitrationService';
import { startAyaService } from './services/ayaService';
import { startDictionaryUpdater } from './services/dictionaryUpdater';
import { REST } from '@discordjs/rest';
import { promises as fs } from 'fs';
import path from 'path';

// Define dictionary types for global access
declare global {
  // eslint-disable-next-line no-var
  var dict: Record<string, string>;
}

// Initialize the Discord client
const client = new Client(clientOptions);

// Track connection state and reconnection attempts
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Optional webhook for critical alerts
let alertWebhook: WebhookClient | null = null;
if (process.env.ALERT_WEBHOOK_URL) {
  alertWebhook = new WebhookClient({ url: process.env.ALERT_WEBHOOK_URL });
}

// Load Warframe data for riven calculations
export let warframeData: {
  [key: string]: any;
  dict: any;
  ExportWeapons: any;
  ExportUpgrades: any;
  ExportTextIcons: any;
} = {
  dict: {},
  ExportWeapons: {},
  ExportUpgrades: {},
  ExportTextIcons: {}
};

async function loadWarframeData() {
  try {
    logger.info('Loading Warframe data for riven calculations from local files...');
    
    // Helper function to read local JSON files
    async function readLocalJson(filePath: string) {
      try {
        const data = await fs.readFile(filePath, 'utf8');
        try {
          const jsonData = JSON.parse(data);
          if (!jsonData) throw new Error("Empty JSON file");
          return jsonData;
        } catch (parseError: any) {
          logger.error(`Invalid JSON in local file ${filePath}: ${parseError.message}`);
          throw parseError;
        }
      } catch (error: any) {
        logger.error(`Failed to read local file ${filePath}: ${error.message}`);
        throw error;
      }
    }
    
    // Define local file paths
    const localPaths = {
      dict: path.join(__dirname, '../dict/dict.en.json'),
      weapons: path.join(__dirname, '../dict/ExportWeapons.json'),
      upgrades: path.join(__dirname, '../dict/ExportUpgrades.json'),
      textIcons: path.join(__dirname, '../dict/ExportTextIcons.json')
    };
    
    try {
      logger.info('Loading Warframe data from local files...');
      const [dict, ExportWeapons, ExportUpgrades, ExportTextIcons] = await Promise.all([
        readLocalJson(localPaths.dict),
        readLocalJson(localPaths.weapons),
        readLocalJson(localPaths.upgrades),
        readLocalJson(localPaths.textIcons)
      ]);
      
      // Store the data globally
      warframeData.dict = dict;
      warframeData.ExportWeapons = ExportWeapons;
      warframeData.ExportUpgrades = ExportUpgrades;
      warframeData.ExportTextIcons = ExportTextIcons;
      
      logger.info('Warframe data loaded successfully from local files');
    } catch (error: any) {
      throw new Error(`Failed to load local files: ${error.message || 'Unknown error'}`);
    }
    
    // Verify data integrity
    const dataKeys = Object.keys(warframeData);
    for (const key of dataKeys) {
      if (!warframeData[key] || Object.keys(warframeData[key]).length === 0) {
        logger.warn(`Warning: ${key} data is empty or invalid`);
      }
    }
    
    // Also set it in the global scope for backward compatibility
    global.dict = warframeData.dict;
    
    return warframeData;
  } catch (error: any) {
    logger.error('Error loading Warframe data:', error);
    
    // Send alert if webhook is configured
    if (alertWebhook) {
      alertWebhook.send({
        content: `⚠️ **Error Loading Warframe Data**\n\`\`\`${error.stack || error.message || error}\`\`\`\nRiven-related commands may not function correctly.`
      }).catch(() => {}); // Ignore webhook errors
    }
    
    return null;
  }
}

// Set up heartbeat function
function startHeartbeat() {
  let heartbeatInterval: NodeJS.Timeout;
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (client.isReady()) {
      logger.debug('Heartbeat ping sent');
      
      // Every 5 minutes, log some statistics
      if (new Date().getMinutes() % 5 === 0 && new Date().getSeconds() < 5) {
        logger.info(`Stats: ${client.guilds.cache.size} guilds, Ping: ${client.ws.ping}ms`);
      }
    } else {
      logger.warn('Client not ready during heartbeat check. Attempting to reconnect...');
      client.login(config.BOT_TOKEN)
        .then(() => logger.info('Reconnected successfully after heartbeat check'))
        .catch(error => logger.error('Failed to reconnect after heartbeat check:', error));
    }
  }, 30000); // 30 seconds
}

// Set up Discord client listeners for connection issues
function setupClientListeners() {
  // Handle Discord.js errors
  client.on(Events.Error, (error) => {
    logger.error('Discord client error:', error);
    
    // Send alert if webhook is configured
    if (alertWebhook) {
      alertWebhook.send({
        content: `⚠️ **Discord Client Error**\n\`\`\`${error.stack || error.message}\`\`\``
      }).catch(() => {}); // Ignore webhook errors
    }
  });
  
  // Handle disconnect events
  client.on(Events.ShardDisconnect, (event, id) => {
    logger.warn(`Shard #${id} disconnected: ${event.reason} (code: ${event.code})`);
    
    // Don't attempt to reconnect if the disconnect was intentional (code 1000)
    if (event.code !== 1000) {
      logger.info('Attempting to reconnect...');
      if (!client.isReady()) {
        client.login(config.BOT_TOKEN)
          .then(() => {
            logger.info('Reconnected successfully');
            reconnectAttempts = 0;
          })
          .catch(error => {
            logger.error('Failed to reconnect:', error);
          });
      }
    }
  });
  
  // Handle reconnection events
  client.on(Events.ShardReconnecting, (id) => {
    logger.info(`Shard #${id} reconnecting...`);
  });
  
  // Handle resume events
  client.on(Events.ShardResume, (id, replayedEvents) => {
    logger.info(`Shard #${id} resumed connection. Replayed ${replayedEvents} events.`);
    reconnectAttempts = 0;
  });
  
  // Handle ready event
  client.on(Events.ShardReady, (id) => {
    logger.info(`Shard #${id} connected and ready.`);
    reconnectAttempts = 0;
  });

  // Add debug event for more detailed connection information in development
  if (config.isDev && process.env.ENABLE_DISCORD_DEBUG === 'true') {
    client.on(Events.Debug, (info) => {
      logger.debug(`Discord Debug: ${info}`);
    });
  }
}

// Handle process events for graceful shutdown
process.on('SIGINT', () => {
  logger.info('SIGINT received. Bot shutting down...');
  
  // Log stack trace to help identify what triggered the SIGINT
  logger.info('SIGINT stack trace:');
  const stackTrace = new Error().stack;
  logger.info(stackTrace || 'No stack trace available');
  
  // Add a slight delay before shutting down to ensure logs are written
  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Bot shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.critical('Unhandled promise rejection:', error);
  
  // Send alert if webhook is configured
  if (alertWebhook) {
    alertWebhook.send({
      content: `⚠️ **Unhandled Promise Rejection**\n\`\`\`${error instanceof Error ? error.stack : String(error)}\`\`\``
    }).catch(() => {}); // Ignore webhook errors
  }
});

process.on('uncaughtException', (error) => {
  logger.critical('Uncaught exception:', error);
  
  // Send alert if webhook is configured
  if (alertWebhook) {
    alertWebhook.send({
      content: `⚠️ **Uncaught Exception**\n\`\`\`${error.stack || error.message}\`\`\``
    }).catch(() => {}); // Ignore webhook errors
  }
  
  // Don't exit the process here, just log the error
});

// Add this helper function to report problems with Discord
// Can be called from commands or events when they detect issues
export function reportDiscordAPIIssue(issue: string, details?: any) {
  const message = `Discord API Issue: ${issue}`;
  logger.critical(message, details);
  
  // Send alert if webhook is configured
  if (alertWebhook) {
    alertWebhook.send({
      content: `⚠️ **${message}**\n${details ? `\`\`\`${JSON.stringify(details, null, 2)}\`\`\`` : ''}`
    }).catch(() => {}); // Ignore webhook errors
  }
}

/**
 * Determine the command deployment mode based on configuration
 */
function determineDeploymentMode(config: any): 'guild' | 'global' {
  // If explicitly set to guild or global, use that
  if (config.COMMAND_DEPLOYMENT_MODE === 'guild' || config.COMMAND_DEPLOYMENT_MODE === 'global') {
    return config.COMMAND_DEPLOYMENT_MODE;
  }
  
  // In auto mode, use guild mode for development and global for production
  if (config.COMMAND_DEPLOYMENT_MODE === 'auto') {
    return config.isDev ? 'guild' : 'global';
  }
  
  // Default fallback
  return 'global';
}

/**
 * Register commands to a specific guild
 */
async function registerCommandsToGuild(
  rest: REST, 
  clientId: string, 
  guildId: string, 
  commandData: any[]
): Promise<void> {
  logger.info(`Registering ${commandData.length} commands to guild ${guildId}...`);
  
  try {
    logger.info('Starting guild command registration...');
    
    // Use a longer timeout for rate limits
    const response = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandData }
    );
    
    // Validate the response
    const responseArray = response as any[];
    if (Array.isArray(responseArray)) {
      logger.info(`Successfully registered ${responseArray.length}/${commandData.length} commands to guild ${guildId}`);
      
      // Log each registered command for verification
      responseArray.forEach(cmd => {
        logger.debug(`Registered command: ${cmd.name} (ID: ${cmd.id})`);
      });
      
      // Check for missing commands
      const registeredNames = responseArray.map(cmd => cmd.name);
      const missingCommands = commandData
        .filter(cmd => !registeredNames.includes(cmd.name))
        .map(cmd => cmd.name);
      
      if (missingCommands.length > 0) {
        logger.warn(`Some commands were not registered to guild ${guildId}: ${missingCommands.join(', ')}`);
      }
    } else {
      logger.warn('Unexpected response format from Discord API:', response);
    }
  } catch (registerError) {
    logger.error(`Error registering commands to guild ${guildId}:`, registerError);
    
    // Handle rate limit errors
    if (registerError && typeof registerError === 'object' && 'message' in registerError && 
        typeof registerError.message === 'string' && registerError.message.includes('rate limit')) {
      logger.error(`Hit rate limit during registration to guild ${guildId}. The bot will continue, but commands may not be updated.`);
    }
    
    // Rethrow for caller to handle
    throw registerError;
  }
}

/**
 * Register commands globally
 */
async function registerCommandsGlobally(
  rest: REST, 
  clientId: string, 
  commandData: any[]
): Promise<void> {
  logger.info(`Registering ${commandData.length} commands globally...`);
  
  try {
    logger.info('Starting global command registration...');
    
    const response = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandData }
    );
    
    // Validate the response
    const responseArray = response as any[];
    if (Array.isArray(responseArray)) {
      logger.info(`Successfully registered ${responseArray.length}/${commandData.length} commands globally`);
      
      // Log each registered command for verification
      responseArray.forEach(cmd => {
        logger.debug(`Registered global command: ${cmd.name} (ID: ${cmd.id})`);
      });
      
      // Check for missing commands
      const registeredNames = responseArray.map(cmd => cmd.name);
      const missingCommands = commandData
        .filter(cmd => !registeredNames.includes(cmd.name))
        .map(cmd => cmd.name);
      
      if (missingCommands.length > 0) {
        logger.warn(`Some global commands were not registered: ${missingCommands.join(', ')}`);
      }
    } else {
      logger.warn('Unexpected response format from Discord API:', response);
    }
  } catch (registerError) {
    logger.error('Error registering global commands:', registerError);
    
    // Handle rate limit errors
    if (registerError && typeof registerError === 'object' && 'message' in registerError && 
        typeof registerError.message === 'string' && registerError.message.includes('rate limit')) {
      logger.error('Hit rate limit during global registration. The bot will continue, but commands may not be updated.');
    }
    
    // Don't rethrow, just log the error
    logger.error('Global command registration failed. Commands may not be updated.');
  }
}

// Start the bot
async function main() {
  try {
    // Display startup banner
    logger.info('==================================');
    logger.info(`Starting ${config.BOT_NAME} Bot (v1.0.0)`);
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Database: ${config.DATABASE_TYPE}`);
    logger.info('==================================');

    // Initialize database with retry mechanism
    logger.info('Initializing database connection...');
    let dbInitSuccessful = false;
    let dbInitAttempts = 0;
    const MAX_DB_INIT_ATTEMPTS = 3;
    
    while (!dbInitSuccessful && dbInitAttempts < MAX_DB_INIT_ATTEMPTS) {
      dbInitAttempts++;
      try {
        await initDatabase();
        dbInitSuccessful = true;
        logger.info('Database initialized successfully');
      } catch (dbError) {
        if (dbInitAttempts >= MAX_DB_INIT_ATTEMPTS) {
          logger.critical(`Database initialization failed after ${MAX_DB_INIT_ATTEMPTS} attempts. Bot will continue with limited functionality.`, dbError);
          
          // Send alert if webhook is configured
          if (alertWebhook) {
            alertWebhook.send({
              content: '⚠️ **CRITICAL ALERT** ⚠️\n' +
                      'Database initialization failed after multiple attempts. ' +
                      'Bot is running with limited functionality. ' +
                      'Manual intervention required!'
            }).catch(() => {}); // Ignore webhook errors
          }
          
          // Continue without database - some features will be limited
          break;
        } else {
          logger.warn(`Database initialization attempt ${dbInitAttempts}/${MAX_DB_INIT_ATTEMPTS} failed. Retrying in 5 seconds...`, dbError);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    // Initialize dictionaries for item lookups
    logger.info('Initializing dictionaries...');
    try {
      await initializeDictionaries();
      logger.info('Dictionaries initialized successfully');
    } catch (dictError) {
      logger.error('Dictionary initialization failed. Item lookups may use fallback names.', dictError);
    }
    
    // Log important configuration
    logger.debug('Configuration:', {
      isDev: config.isDev,
      testGuild: config.TEST_GUILD_ID || 'Not set',
      intents: clientOptions.intents.length,
      features: {
        cooldowns: config.ENABLE_COOLDOWNS,
        logging: config.ENABLE_LOGGING,
        databaseAvailable: dbInitSuccessful
      }
    });
    
    // Register commands
    logger.info('Loading commands...');
    client.commands = new Collection<string, Command>();
    const commandCount = await loadCommands(client);
    logger.info(`Loaded ${commandCount} commands`);

    // Command registration with Discord API
    if (config.SKIP_COMMAND_REGISTRATION) {
      logger.info('Skipping command registration with Discord API (SKIP_COMMAND_REGISTRATION=true)');
    } else {
      // ADDED: Automatically register commands with Discord API on startup
      logger.info('Automatically registering commands with Discord API...');
      try {
        // Initialize REST API client with proper timeout and retry options
        const rest = getRestInstance();
        
        // Get commands from the collection and convert to JSON for REST API
        const commandsArray = Array.from(client.commands.values());
        const commandData = commandsArray.map(command => command.data.toJSON());
        
        // Check if we have any commands to register
        if (commandData.length === 0) {
          logger.warn('⚠️ No commands found to register with Discord API! Check command loading.');
          logger.info('Command registration skipped due to empty commands collection.');
          return; // Exit the command registration process
        }
        
        // Log detailed command data for debugging
        logger.debug(`Preparing to register ${commandData.length} commands:`, 
          commandData.map(cmd => ({ name: cmd.name, description: cmd.description })));
        
        // Determine deployment mode based on configuration
        const deploymentMode = determineDeploymentMode(config);
        logger.info(`Using command deployment mode: ${deploymentMode}`);
        
        if (deploymentMode === 'guild') {
          // Register commands to specific guilds for instant updates
          const guildIds = config.DEPLOYMENT_GUILD_IDS.length > 0 
            ? config.DEPLOYMENT_GUILD_IDS 
            : (config.TEST_GUILD_ID ? [config.TEST_GUILD_ID] : []);
          
          if (guildIds.length === 0) {
            logger.warn('Guild deployment mode selected but no guild IDs provided. Switching to global mode.');
            await registerCommandsGlobally(rest, config.CLIENT_ID, commandData);
          } else {
            logger.info(`Registering ${commandData.length} commands to ${guildIds.length} guild(s): ${guildIds.join(', ')}`);
            
            // Register commands to each configured guild
            for (const guildId of guildIds) {
              try {
                await registerCommandsToGuild(rest, config.CLIENT_ID, guildId, commandData);
              } catch (guildError) {
                logger.error(`Failed to register commands to guild ${guildId}:`, guildError);
              }
            }
          }
        } else {
          // Global deployment mode - register commands globally
          await registerCommandsGlobally(rest, config.CLIENT_ID, commandData);
        }
      } catch (error) {
        logger.error('Error registering commands on startup:', error);
        // Continue with bot startup despite command registration failures
      }
    }
    
    // Register events
    logger.info('Loading event handlers...');
    const eventCount = await loadEvents(client);
    logger.info(`Loaded ${eventCount} event handlers`);
    
    // Set up Discord client event listeners for connection issues
    setupClientListeners();
    
    // Login to Discord with verification
    logger.info('Attempting to connect to Discord...');
    try {
      await client.login(config.BOT_TOKEN);
      // Reset reconnect attempts after successful login
      reconnectAttempts = 0;
    } catch (error: any) {
      throw new Error(`Failed to login to Discord: ${error?.message || 'Unknown error'}`);
    }
    
    // The client is ready event will handle the rest through the ready.ts event handler
    logger.info(`Discord bot login successful`);
    
    // Start the heartbeat
    startHeartbeat();

    // After client login, set up the periodic tasks
    client.once(Events.ClientReady, async (c) => {
      logger.info(`Ready! Logged in as ${c.user.tag}`);
      
      // Initialize all background services
      try {
        await initArbitrationService(c);
        logger.info('Arbitration service initialized');
        
        startAyaService(c);
        logger.info('Aya service initialized');
        
        // Start the dictionary updater service
        startDictionaryUpdater();
        logger.info('Dictionary updater service initialized');
        
        // Load Warframe data
        await loadWarframeData();
        
        // Any other background services...

        // Import PostgreSQL DB client
        const { pgdb } = await import('./services/postgresDatabase');

        // Set up interval to check for expired giveaways
        let giveawayErrorCount = 0;
        const MAX_GIVEAWAY_ERRORS = 5;
        let giveawayCheckInterval = 500; // Start with 500ms
        const MAX_GIVEAWAY_INTERVAL = 30000; // Max 30 seconds between checks
        
        const checkGiveaways = async () => {
          try {
            if (!pgdb) {
              setTimeout(checkGiveaways, giveawayCheckInterval);
              return;
            }

            // Find giveaways that have expired but haven't been ended yet
            const expiredGiveaways = await pgdb.getExpiredGiveaways();
            
            if (expiredGiveaways.length > 0) {
              logger.info(`Found ${expiredGiveaways.length} expired giveaways to process`);
              
              // Process each giveaway
              const { endGiveaway } = require('./commands/utility/giveaway');
              
              for (const giveaway of expiredGiveaways) {
                try {
                  await endGiveaway(c, giveaway);
                } catch (endError) {
                  logger.error(`Error ending giveaway ${giveaway.id}:`, endError);
                }
              }
            }
            
            // Reset error count and interval on success
            if (giveawayErrorCount > 0) {
              giveawayErrorCount = Math.max(0, giveawayErrorCount - 1);
              if (giveawayCheckInterval > 500) {
                giveawayCheckInterval = Math.max(500, giveawayCheckInterval / 2);
                logger.info(`Reducing giveaway check interval to ${giveawayCheckInterval}ms after successful check`);
              }
            }
          } catch (error) {
            giveawayErrorCount++;
            logger.error(`Error checking for expired giveaways (error #${giveawayErrorCount}):`, error);
            
            // Implement exponential backoff if errors persist
            if (giveawayErrorCount > 2) {
              const previousInterval = giveawayCheckInterval;
              giveawayCheckInterval = Math.min(giveawayCheckInterval * 2, MAX_GIVEAWAY_INTERVAL);
              if (previousInterval !== giveawayCheckInterval) {
                logger.warn(`Increasing giveaway check interval to ${giveawayCheckInterval}ms due to persistent errors`);
              }
            }
          } finally {
            // Schedule next check with the current interval
            setTimeout(checkGiveaways, giveawayCheckInterval);
          }
        };
        
        // Start the giveaway check loop
        checkGiveaways();

        // Set up LFG thread cleanup interval with similar improved error handling
        let lfgErrorCount = 0;
        const MAX_LFG_ERRORS = 5;
        let lfgCheckInterval = 15 * 60 * 1000; // Start with 15 minutes
        const MAX_LFG_INTERVAL = 60 * 60 * 1000; // Max 1 hour between checks
        
        const checkLfgThreads = async () => {
          try {
            if (!pgdb) {
              setTimeout(checkLfgThreads, lfgCheckInterval);
              return;
            }
            
            // Get LFG sessions that need cleanup
            const sessionsToCleanup = await pgdb.getLfgSessionsForCleanup(1.5, 24);
            
            if (sessionsToCleanup.length > 0) {
              logger.info(`Found ${sessionsToCleanup.length} LFG sessions to clean up`);
              
              // Process each session
              for (const session of sessionsToCleanup) {
                logger.info(`Processing LFG session ${session.id} (${session.mission_name}), status: ${session.status}`);
                
                try {
                  // Get the guild
                  const guild = await c.guilds.fetch(session.guild_id).catch((error: Error): null => {
                    logger.error(`Error fetching guild ${session.guild_id}: ${error}`);
                    return null;
                  });
                  
                  if (!guild) {
                    logger.warn(`Guild ${session.guild_id} not found or bot no longer has access. Marking LFG session as cleaned up.`);
                    await pgdb.updateLfgSessionStatus(session.id, session.status === 'FULL' ? 'FULL' : 'CLOSED');
                    continue;
                  }
                  
                  // Get the thread
                  const thread = await guild.channels.fetch(session.thread_id).catch((error: Error): null => {
                    logger.error(`Error fetching thread ${session.thread_id}: ${error}`);
                    return null;
                  });
                  
                  if (!thread || !(thread instanceof ThreadChannel)) {
                    logger.warn(`Thread ${session.thread_id} not found or is not a thread. Marking LFG session as cleaned up.`);
                    await pgdb.updateLfgSessionStatus(session.id, session.status === 'FULL' ? 'FULL' : 'CLOSED');
                    continue;
                  }
                  
                  // If thread exists and is not archived, archive it now
                  if (!thread.archived) {
                    logger.info(`Archiving thread ${thread.id} (${thread.name})`);
                    await thread.setArchived(true, 'LFG auto-cleanup');
                  }
                  
                  // Update the database status
                  await pgdb.updateLfgSessionStatus(session.id, session.status === 'FULL' ? 'FULL' : 'CLOSED');
                  logger.info(`LFG session ${session.id} cleaned up successfully`);
                } catch (sessionError) {
                  logger.error(`Error processing LFG session ${session.id}:`, sessionError);
                }
              }
            }
            
            // Reset error count and interval on success
            if (lfgErrorCount > 0) {
              lfgErrorCount = Math.max(0, lfgErrorCount - 1);
              if (lfgCheckInterval > 15 * 60 * 1000) {
                lfgCheckInterval = Math.max(15 * 60 * 1000, lfgCheckInterval / 2);
                logger.info(`Reducing LFG check interval to ${lfgCheckInterval/60000} minutes after successful check`);
              }
            }
          } catch (error) {
            lfgErrorCount++;
            logger.error(`Error cleaning up LFG sessions (error #${lfgErrorCount}):`, error);
            
            // Implement exponential backoff if errors persist
            if (lfgErrorCount > 2) {
              const previousInterval = lfgCheckInterval;
              lfgCheckInterval = Math.min(lfgCheckInterval * 2, MAX_LFG_INTERVAL);
              if (previousInterval !== lfgCheckInterval) {
                logger.warn(`Increasing LFG check interval to ${lfgCheckInterval/60000} minutes due to persistent errors`);
              }
            }
          } finally {
            // Schedule next check with the current interval
            setTimeout(checkLfgThreads, lfgCheckInterval);
          }
        };
        
        // Start the LFG cleanup loop
        checkLfgThreads();

        // Set up giveaway cleanup interval
        let giveawayCleanupErrorCount = 0;
        const MAX_GIVEAWAY_CLEANUP_ERRORS = 5;
        // Check once per day (24 hours in milliseconds)
        let giveawayCleanupInterval = 24 * 60 * 60 * 1000;
        const MAX_GIVEAWAY_CLEANUP_INTERVAL = 48 * 60 * 60 * 1000; // Max 48 hours
        
        const cleanupOldGiveaways = async () => {
          try {
            if (!pgdb) {
              setTimeout(cleanupOldGiveaways, giveawayCleanupInterval);
              return;
            }
            
            // Get retention period from environment or use default (7 days)
            const retentionDays = parseInt(process.env.GIVEAWAY_RETENTION_DAYS || '7');
            logger.info(`Starting giveaway cleanup process (retention: ${retentionDays} days)`);
            
            // Delete ended giveaways older than the retention period
            const count = await pgdb.deleteOldGiveaways(retentionDays);
            
            if (count > 0) {
              logger.info(`Giveaway cleanup complete: Deleted ${count} ended giveaways older than ${retentionDays} days`);
            } else {
              logger.debug('No old giveaways to clean up');
            }
            
            // Reset error count and interval on success
            if (giveawayCleanupErrorCount > 0) {
              giveawayCleanupErrorCount = Math.max(0, giveawayCleanupErrorCount - 1);
              if (giveawayCleanupInterval > 24 * 60 * 60 * 1000) {
                giveawayCleanupInterval = Math.max(24 * 60 * 60 * 1000, giveawayCleanupInterval / 2);
                logger.info(`Reducing giveaway cleanup interval to ${giveawayCleanupInterval/3600000} hours after successful cleanup`);
              }
            }
          } catch (error) {
            giveawayCleanupErrorCount++;
            logger.error(`Error cleaning up old giveaways (error #${giveawayCleanupErrorCount}):`, error);
            
            // Implement exponential backoff if errors persist
            if (giveawayCleanupErrorCount > 2) {
              const previousInterval = giveawayCleanupInterval;
              giveawayCleanupInterval = Math.min(giveawayCleanupInterval * 2, MAX_GIVEAWAY_CLEANUP_INTERVAL);
              if (previousInterval !== giveawayCleanupInterval) {
                logger.warn(`Increasing giveaway cleanup interval to ${giveawayCleanupInterval/3600000} hours due to persistent errors`);
              }
            }
          } finally {
            // Schedule next cleanup with the current interval
            setTimeout(cleanupOldGiveaways, giveawayCleanupInterval);
          }
        };
        
        // Start the giveaway cleanup loop
        cleanupOldGiveaways();

        // Set up LFG session cleanup interval
        let lfgCleanupErrorCount = 0;
        const MAX_LFG_CLEANUP_ERRORS = 5;
        // Check once per day (24 hours in milliseconds)
        let lfgCleanupInterval = 24 * 60 * 60 * 1000;
        const MAX_LFG_CLEANUP_INTERVAL = 48 * 60 * 60 * 1000; // Max 48 hours
        
        const cleanupOldLfgSessions = async () => {
          try {
            if (!pgdb) {
              setTimeout(cleanupOldLfgSessions, lfgCleanupInterval);
              return;
            }
            
            // Get retention period from environment or use default (7 days)
            const retentionDays = parseInt(process.env.LFG_RETENTION_DAYS || '7');
            logger.info(`Starting LFG session cleanup process (retention: ${retentionDays} days)`);
            
            // Delete closed LFG sessions older than the retention period
            const count = await pgdb.deleteOldLfgSessions(retentionDays);
            
            if (count > 0) {
              logger.info(`LFG session cleanup complete: Deleted ${count} closed LFG sessions older than ${retentionDays} days`);
            } else {
              logger.debug('No old LFG sessions to clean up');
            }
            
            // Reset error count and interval on success
            if (lfgCleanupErrorCount > 0) {
              lfgCleanupErrorCount = Math.max(0, lfgCleanupErrorCount - 1);
              if (lfgCleanupInterval > 24 * 60 * 60 * 1000) {
                lfgCleanupInterval = Math.max(24 * 60 * 60 * 1000, lfgCleanupInterval / 2);
                logger.info(`Reducing LFG session cleanup interval to ${lfgCleanupInterval/3600000} hours after successful cleanup`);
              }
            }
          } catch (error) {
            lfgCleanupErrorCount++;
            logger.error(`Error cleaning up old LFG sessions (error #${lfgCleanupErrorCount}):`, error);
            
            // Implement exponential backoff if errors persist
            if (lfgCleanupErrorCount > 2) {
              const previousInterval = lfgCleanupInterval;
              lfgCleanupInterval = Math.min(lfgCleanupInterval * 2, MAX_LFG_CLEANUP_INTERVAL);
              if (previousInterval !== lfgCleanupInterval) {
                logger.warn(`Increasing LFG session cleanup interval to ${lfgCleanupInterval/3600000} hours due to persistent errors`);
              }
            }
          } finally {
            // Schedule next cleanup with the current interval
            setTimeout(cleanupOldLfgSessions, lfgCleanupInterval);
          }
        };
        
        // Start the LFG session cleanup loop
        cleanupOldLfgSessions();
      } catch (error) {
        logger.error('Error initializing background services:', error);
      }
    }); // End of client.once
  } catch (error) {
    logger.error('Error starting the bot:', error);
  }
}

// Load weapon lookup service
import './services/weaponLookupService';

main();

// Start bot API server for dashboard communication
import { startBotAPI } from './api/botAPI';

// Start the bot API server on a different port
if (config.DASHBOARD_ENABLED) {
  startBotAPI(client, 3081);
  logger.info('Bot API server started on port 3081');
}

// Optionally start dashboard server
import { startDashboard } from '../dashboard/src/server';
startDashboard();
