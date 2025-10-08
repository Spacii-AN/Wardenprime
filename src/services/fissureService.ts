import { Client, TextChannel } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { pgdb } from './postgresDatabase';  // PostgreSQL database
import { createEmbed } from '../utils/embedBuilder';
import os from 'os';

// Get environment variable for logging
const ENABLE_SERVICE_LOGS = process.env.ENABLE_FISSURE_SERVICE_LOGS === 'true';

// Custom logger that respects the service logging setting
const serviceLogger = {
  debug: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.debug(`[Fissure] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.info(`[Fissure] ${message}`, ...args);
    }
  },
  // Always log warnings and errors
  warn: (message: string, ...args: any[]) => {
    logger.warn(`[Fissure] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    logger.error(`[Fissure] ${message}`, ...args);
  }
};

// Interfaces
interface FissureNotification {
  id: string;
  guild_id: string;
  channel_id: string;
  mission_type: string;
  role_id: string | null;
  steel_path: boolean;
  created_at: string;
  updated_at: string;
  last_notified?: string;
  message_id?: string;
}

interface RegionInfo {
  name: string;
  systemName: string;
  missionName: string;
  factionName: string;
}

interface ActiveMission {
  _id: { $oid: string };
  Region: number;
  Seed: number;
  Activation: { $date: { $numberLong: string } };
  Expiry: { $date: { $numberLong: string } };
  Node: string;
  MissionType: string;
  Modifier: string;
  Hard: boolean;
}

interface ApiResponse {
  ActiveMissions: ActiveMission[];
}

// Mapping for Void Fissure Tiers to Relic Names
const VOID_TIER_MAP: Record<string, string> = {
  'VoidT1': 'Lith',
  'VoidT2': 'Meso',
  'VoidT3': 'Neo',
  'VoidT4': 'Axi',
  'VoidT5': 'Requiem',
  'VoidT6': 'Omnia'
};

// Global state
let isServiceRunning = false;
let isFirstRun = true;
let lastFissureList: Record<string, ActiveMission[]> | null = null;
let checkInterval = 30000; // Check every 30 seconds (reduced from 60000)
let recentlyNotifiedMissions = new Map<string, string>(); // Map to track recently notified missions
let lastSuccessfulCheck = 0; // Timestamp of last successful check
let errorCount = 0; // Track consecutive errors
const MAX_ERRORS_BEFORE_RESTART = 3; // Restart service after this many consecutive errors
const WATCHDOG_INTERVAL = 120000; // Check service health every 2 minutes

// Special mission types that need special handling
const SPECIAL_MISSION_TYPES = [
  'void cascade', 
  'cascade', 
  'void flood', 
  'flood', 
  'void armageddon', 
  'armageddon'
];

// Initialize the fissure service
export function startFissureService(client: Client): void {
  if (isServiceRunning) {
    serviceLogger.debug('Fissure service is already running');
    return;
  }
  
  // Only log startup banner if service logs are enabled
  if (ENABLE_SERVICE_LOGS) {
    console.log('=== FISSURE SERVICE: STARTING ===');
  }
  
  // Use normal logger for critical service events
  logger.info('Starting Fissure notification service');
  isServiceRunning = true;
  lastSuccessfulCheck = Date.now(); // Initialize last successful check time
  errorCount = 0; // Reset error counter
  
  // Empty the lastFissureList on startup to force notification checking
  lastFissureList = null;
  logger.info('Cleared fissure cache on startup to ensure initial notifications are sent');
  
  // Start checking for updates
  checkAndNotify(client);
  
  // Start the watchdog to ensure service keeps running
  startWatchdog(client);
}

// Watchdog to ensure the service is running properly
function startWatchdog(client: Client): void {
  setInterval(() => {
    // Check if the service is running but hasn't had a successful check in a while
    const now = Date.now();
    const timeSinceLastCheck = now - lastSuccessfulCheck;
    
    // If it's been more than 3x the check interval since last successful check, restart
    if (isServiceRunning && timeSinceLastCheck > checkInterval * 3) {
      logger.warn(`Fissure service watchdog: No successful checks in ${Math.floor(timeSinceLastCheck/1000)} seconds. Restarting service.`);
      
      // Reset state and restart
      isServiceRunning = false;
      startFissureService(client);
    }
  }, WATCHDOG_INTERVAL);
}

// Manually trigger a fissure check (used for immediate notification after setup)
export function triggerFissureCheck(client: Client): void {
  // Only show detailed logs if enabled
  if (ENABLE_SERVICE_LOGS) {
    console.log('=======================================');
    console.log('FISSURE SERVICE: MANUAL TRIGGER CALLED');
    console.log('=======================================');
  }
  
  logger.info('Manually triggering fissure check');
  
  // Check if client is ready
  if (!client.isReady()) {
    logger.warn('Client is not ready when triggerFissureCheck was called');
  } else if (ENABLE_SERVICE_LOGS) {
    serviceLogger.info('Client is ready, proceeding with fissure check');
  }
  
  // Start the check process
  checkAndNotify(client);
}

// Main function to check for updates and send notifications
async function checkAndNotify(client: Client): Promise<void> {
  try {
    // Only show check started message if service logs are enabled
    if (ENABLE_SERVICE_LOGS) {
      console.log('=== FISSURE SERVICE: CHECK STARTED ===');
      serviceLogger.debug("Starting fissure check and notification process");
      
      // Debug DB connection only if service logs are enabled
      try {
        console.log('=== TESTING DATABASE ACCESS ===');
        const dbTest = await pgdb.getFissureNotifications();
        console.log(`DB TEST RESULT: Found ${dbTest.length} notification configs`);
        if (dbTest.length > 0) {
          console.log(`First config in DB: ${JSON.stringify(dbTest[0])}`);
        }
      } catch (dbError) {
        console.error('DATABASE ACCESS ERROR:', dbError);
      }
    }
    
    // Check for temporary force detection marker files
    try {
      const fs = await import('fs/promises');
      const fsSync = await import('fs');
      const path = await import('path');
      const tempDir = path.join(process.cwd(), 'temp');
      
      // Only proceed if the temp directory exists
      if (fsSync.existsSync(tempDir)) {
        const files = await fs.readdir(tempDir);
        const markerFiles = files.filter(file => file.startsWith('force_fissure_') && file.endsWith('.marker'));
        
        if (markerFiles.length > 0) {
          logger.info(`Found ${markerFiles.length} force detection marker files`);
          
          // Process each marker file
          for (const markerFile of markerFiles) {
            try {
              // Extract mission type from filename
              // Format: force_fissure_guildId_channelId_Mission_Type.marker
              const parts = markerFile.split('_');
              if (parts.length >= 5) {
                // The mission type starts from the 4th part and continues to before .marker
                const missionTypeWithExt = parts.slice(4).join('_');
                const missionType = missionTypeWithExt.replace('.marker', '').replace(/_/g, ' ');
                
                logger.info(`Processing force detection for mission type: ${missionType}`);
                
                // Reset cache for this mission type
                await resetFissureCacheForMissionType(missionType);
                
                // Delete the marker file after processing
                await fs.unlink(path.join(tempDir, markerFile));
                logger.info(`Deleted marker file: ${markerFile}`);
              }
            } catch (markerError) {
              logger.error(`Error processing marker file ${markerFile}:`, markerError);
            }
          }
        }
      }
    } catch (fsError) {
      logger.error('Error checking for marker files:', fsError);
    }
    
    // Fetch current world state for fissure missions
    const response = await axios.get<ApiResponse>('https://oracle.browse.wf/worldState.json', {
      timeout: 10000,
      headers: {
        'User-Agent': 'KorptairBot/1.0.0'
      }
    });

    const { ActiveMissions } = response.data;
    serviceLogger.debug(`API Response received. Total ActiveMissions: ${ActiveMissions?.length ?? 0}`);

    if (!ActiveMissions || ActiveMissions.length === 0) {
      serviceLogger.warn('No active missions found in API response or incorrect format.');
      errorCount++;
      if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
        logger.error(`Fissure service: ${errorCount} consecutive errors. Service may be stuck.`);
      }
      scheduleNextCheck(client);
      return;
    }

    // Reset error count on successful API call
    errorCount = 0;
    lastSuccessfulCheck = Date.now();

    // Filter only void fissure missions
    const fissureMissions = ActiveMissions.filter(mission => mission.Modifier && mission.Modifier.startsWith('VoidT'));
    serviceLogger.debug(`Filtered down to ${fissureMissions.length} void fissure missions`);

    if (fissureMissions.length === 0) {
      serviceLogger.warn('No void fissure missions found after filtering.');
      scheduleNextCheck(client);
      return;
    }

    // Load dictionaries for translation
    const dictionaries = await loadDictionaries();
    if (!dictionaries) {
      logger.error('Failed to load mission dictionaries');
      scheduleNextCheck(client);
      return;
    }

    // Group by mission type for easier comparison and notification
    const currentFissures = groupMissionsByType(fissureMissions, dictionaries.regionsData, dictionaries.langDict);
    serviceLogger.debug(`Grouped fissures into ${Object.keys(currentFissures).length} mission types: ${Object.keys(currentFissures).join(', ')}`);
    
    // Handle first run differently - check existing notifications in DB to avoid duplicates
    if (isFirstRun) {
      logger.info('First run after startup: checking existing notifications before sending');
      
      // Get all fissure notification configurations from DB
      const allNotifications = await pgdb.getFissureNotifications();
      
      if (allNotifications.length > 0) {
        // Build a map of mission IDs that have already been notified
        const alreadyNotifiedMissions = new Map<string, Set<string>>();
        
        // Collect all mission IDs that have already been notified
        for (const notification of allNotifications) {
          if (notification.last_notified) {
            // Remove special mission type check - always use database state for all mission types
            const key = `${notification.mission_type}:${notification.steel_path}`;
            if (!alreadyNotifiedMissions.has(key)) {
              alreadyNotifiedMissions.set(key, new Set<string>());
            }
            
            // Add each mission ID to the set
            const missionIds = notification.last_notified.split(',');
            missionIds.forEach((id: string) => alreadyNotifiedMissions.get(key)!.add(id));
          }
        }
        
        // If we have previously notified missions, use them to avoid duplicate notifications
        if (alreadyNotifiedMissions.size > 0) {
          logger.info(`Found ${alreadyNotifiedMissions.size} mission types with previous notifications`);
          
          // Initialize lastFissureList with missions that have already been notified
          lastFissureList = {};
          
          // For each current mission type, add its IDs to lastFissureList if they've been notified before
          for (const [missionType, missions] of Object.entries(currentFissures)) {
            // Check both normal and Steel Path variations
            const normalKey = `${missionType}:false`;
            const steelPathKey = `${missionType}:true`;
            
            const normalMissions = missions.filter(m => !m.Hard);
            const steelPathMissions = missions.filter(m => m.Hard);
            
            // Check if we've already notified about the normal missions
            if (normalMissions.length > 0 && alreadyNotifiedMissions.has(normalKey)) {
              const notifiedIds = alreadyNotifiedMissions.get(normalKey)!;
              
              // Only add missions that have already been notified about
              const previouslyNotifiedMissions = normalMissions.filter(mission => 
                notifiedIds.has(mission._id.$oid)
              );
              
              if (previouslyNotifiedMissions.length > 0) {
                if (!lastFissureList[missionType]) {
                  lastFissureList[missionType] = [];
                }
                lastFissureList[missionType].push(...previouslyNotifiedMissions);
              }
            }
            
            // Check if we've already notified about the Steel Path missions
            if (steelPathMissions.length > 0 && alreadyNotifiedMissions.has(steelPathKey)) {
              const notifiedSPIds = alreadyNotifiedMissions.get(steelPathKey)!;
              
              // Only add missions that have already been notified about
              const previouslyNotifiedSPMissions = steelPathMissions.filter(mission => 
                notifiedSPIds.has(mission._id.$oid)
              );
              
              if (previouslyNotifiedSPMissions.length > 0) {
                if (!lastFissureList[missionType]) {
                  lastFissureList[missionType] = [];
                }
                lastFissureList[missionType].push(...previouslyNotifiedSPMissions);
              }
            }
          }
          
          logger.info(`Initialized lastFissureList with ${Object.keys(lastFissureList).length} mission types to avoid duplicate notifications`);

          // Additional check: Look for messages in the target channels to check for active notifications
          logger.info('Checking for recent fissure messages in notification channels');
          try {
            // For each notification configuration, check the channel for existing messages
            const channelChecks = [];
            const channelsChecked = new Set<string>();
            
            for (const notification of allNotifications) {
              // Only check each channel once to avoid unnecessary API calls
              const channelKey = `${notification.guild_id}:${notification.channel_id}`;
              if (channelsChecked.has(channelKey)) continue;
              channelsChecked.add(channelKey);
              
              // Check if we can access this channel
              channelChecks.push(async (): Promise<void> => {
                try {
                  const guild = client.guilds.cache.get(notification.guild_id);
                  if (!guild) return;
                  
                  const channel = await guild.channels.fetch(notification.channel_id).catch((): null => null);
                  if (!channel || !(channel instanceof TextChannel)) return;
                  
                  // Fetch recent messages in the channel (last 10)
                  const messages = await channel.messages.fetch({ limit: 10 });
                  
                  // Check if any messages are about the current fissures
                  for (const [_, message] of messages) {
                    // Only check bot's own messages with embeds
                    if (message.author.id !== client.user?.id || !message.embeds.length) continue;
                    
                    // Check each embed to see if it's a fissure notification
                    for (const embed of message.embeds) {
                      // Skip if no description
                      if (!embed.description) continue;
                      
                      // Check if this is a fissure embed
                      const isFissureEmbed = embed.title?.includes('Lith') || 
                                            embed.title?.includes('Meso') || 
                                            embed.title?.includes('Neo') || 
                                            embed.title?.includes('Axi') || 
                                            embed.title?.includes('Requiem') ||
                                            embed.description.includes('Expires');
                      
                      if (!isFissureEmbed) continue;
                      
                      // Extract timestamp from embed description (expiry time)
                      const expiryMatch = embed.description.match(/<t:(\d+):R>/);
                      if (!expiryMatch) continue;
                      
                      const expiryTimestamp = parseInt(expiryMatch[1]) * 1000;
                      const currentTime = Date.now();
                      
                      // If the mission is still active (not expired), consider it already notified
                      if (expiryTimestamp > currentTime) {
                        logger.info(`Found active fissure notification in ${channel.name} (${channel.id}) with expiry <t:${expiryMatch[1]}:R>`);
                        
                        // Extract mission information from the embed
                        let missionType = '';
                        if (embed.description.includes('Void Cascade')) missionType = 'Void Cascade';
                        else if (embed.description.includes('Void Flood')) missionType = 'Void Flood';
                        else if (embed.description.includes('Void Armageddon')) missionType = 'Void Armageddon';
                        else if (embed.description.includes('DEFENSE')) missionType = 'Defense';
                        else if (embed.description.includes('SURVIVAL')) missionType = 'Survival';
                        else if (embed.description.includes('EXTERMINATE')) missionType = 'Exterminate';
                        else if (embed.description.includes('CAPTURE')) missionType = 'Capture';
                        else if (embed.description.includes('RESCUE')) missionType = 'Rescue';
                        else if (embed.description.includes('SABOTAGE')) missionType = 'Sabotage';
                        else if (embed.description.includes('MOBILE DEFENSE')) missionType = 'Mobile Defense';
                        else if (embed.description.includes('DISRUPTION')) missionType = 'Disruption';
                        
                        const isSteelPath = embed.description.includes('Steel Path: ✅');
                        
                        // If we identified the mission type, add it to recentlyNotifiedMissions
                        if (missionType) {
                          const dedupeKey = `${channel.id}:${missionType}:${isSteelPath}`;
                          // Create a placeholder identifier that will prevent immediate re-notification
                          recentlyNotifiedMissions.set(dedupeKey, `startup_check_${message.id}`);
                          logger.info(`Marked ${missionType} (Steel Path: ${isSteelPath}) as already notified in channel ${channel.id}`);
                        }
                      }
                    }
                  }
                } catch (err) {
                  logger.warn(`Error checking channel ${notification.channel_id} for existing messages:`, err);
                }
              });
            }
            
            // Execute all channel checks in parallel
            await Promise.all(channelChecks.map((check: () => Promise<void>) => check()));
            logger.info(`Completed checking ${channelsChecked.size} channels for existing fissure messages`);
          } catch (err) {
            logger.error('Error during channel message check on startup:', err);
          }
        } else {
          // No previous notifications found, start with empty list
          lastFissureList = {};
          logger.info('No previous notifications found, will notify about all current fissures');
        }
      } else {
        // No notification configs in DB, start with empty list
        lastFissureList = {};
        logger.info('No notification configurations found in database');
      }
      
      isFirstRun = false;
    }
    
    // Debug - log all mission types to help with detection issues
    console.log('=== CURRENT MISSION TYPES ===');
    console.log(JSON.stringify(Object.keys(currentFissures), null, 2));
    
    // Dump count of each mission type, but only if service logs are enabled
    if (ENABLE_SERVICE_LOGS) {
      for (const [type, missions] of Object.entries(currentFissures)) {
        const normalCount = missions.filter(m => !m.Hard).length;
        const steelPathCount = missions.filter(m => m.Hard).length;
        serviceLogger.debug(`Mission type ${type}: ${normalCount} normal, ${steelPathCount} Steel Path`);
      }
    }
    
    // 1. Check for new fissure missions
    const newFissuresMissionTypes = findNewFissureMissions(currentFissures);
    
    // 2. Get all fissure notification configurations
    const allNotifications = await pgdb.getFissureNotifications();
    serviceLogger.debug(`Found ${allNotifications.length} fissure notification configurations in database`);
    
    // Log all notification configurations, but only if service logs are enabled
    if (ENABLE_SERVICE_LOGS) {
      for (const notification of allNotifications) {
        serviceLogger.debug(`Config Found: ID=${notification.id}, Guild=${notification.guild_id}, Channel=${notification.channel_id}, Type=${notification.mission_type}, SteelPath=${notification.steel_path}, Role=${notification.role_id || 'None'}, LastNotified=${notification.last_notified || 'Never'}`);
      }
    }
    
    if (allNotifications.length > 0 && newFissuresMissionTypes.length > 0) {
      logger.info(`Found new fissure missions for types: ${newFissuresMissionTypes.join(', ')}`);
      
      // Filter notifications for mission types that have new fissures
      const notificationsToSend = allNotifications.filter(notification => {
        // Normalize mission type for comparison
        const normalizedConfigType = notification.mission_type.toLowerCase().trim();
        
        // Check if the normalized notification type matches any of the new mission types
        return newFissuresMissionTypes.some(newType => {
          const normalizedNewType = newType.toLowerCase().trim();
          
          // Special handling for common mission types
          if (normalizedConfigType.includes('cascade') && normalizedNewType.includes('cascade')) {
            return true;
          }
          if (normalizedConfigType.includes('flood') && normalizedNewType.includes('flood')) {
            return true;
          }
          if (normalizedConfigType.includes('armageddon') && normalizedNewType.includes('armageddon')) {
            return true;
          }
          
          // For other types, check if either contains the other
          return normalizedNewType.includes(normalizedConfigType) || normalizedConfigType.includes(normalizedNewType);
        });
      });
      
      if (notificationsToSend.length > 0) {
        await sendFissureNotifications(client, notificationsToSend, currentFissures);
      }
    }
    
    // If no new mission types, nothing to do
    if (newFissuresMissionTypes.length === 0) {
      logger.debug('No new fissure mission types detected');
      
      // Check for special mission types that should always trigger notifications
      const specialMissionTypes: string[] = [];
      for (const missionType of Object.keys(currentFissures)) {
        const missionTypeLower = missionType.toLowerCase();
        if (missionTypeLower.includes('cascade') || 
            missionTypeLower.includes('flood') || 
            missionTypeLower.includes('armageddon')) {
          console.log(`Found special mission type: ${missionType} - will always send notifications`);
          specialMissionTypes.push(missionType);
        }
      }
      
      // If we found special mission types, send notifications for them
      if (specialMissionTypes.length > 0) {
        logger.info(`Found ${specialMissionTypes.length} special mission types to always notify about`);
        
        // Filter notifications for special mission types
        const specialNotifications = allNotifications.filter(notification => {
          const normalizedType = notification.mission_type.toLowerCase().trim();
          return specialMissionTypes.some(specialType => {
            const specialTypeLower = specialType.toLowerCase();
            return (normalizedType.includes('cascade') && specialTypeLower.includes('cascade')) ||
                   (normalizedType.includes('flood') && specialTypeLower.includes('flood')) ||
                   (normalizedType.includes('armageddon') && specialTypeLower.includes('armageddon'));
          });
        });
        
        if (specialNotifications.length > 0) {
          await sendFissureNotifications(client, specialNotifications, currentFissures);
        }
      }
    }
    
    // Update the last fissure list
    lastFissureList = currentFissures;
    
    // Schedule the next check
    scheduleNextCheck(client);
    
  } catch (error) {
    errorCount++;
    logger.error(`Error in fissure service check (error #${errorCount}):`, error);
    
    // If there have been multiple consecutive errors, the service might be stuck
    if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
      logger.warn(`Fissure service: ${errorCount} consecutive errors. Will attempt restart if condition persists.`);
    }
    
    // Even if there's an error, continue checking
    scheduleNextCheck(client);
  }
}

// Schedule the next check
function scheduleNextCheck(client: Client): void {
  setTimeout(() => checkAndNotify(client), checkInterval);
}

// Load dictionaries from files
async function loadDictionaries() {
  try {
    const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
    const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, RegionInfo>;

    const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
    const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;

    return { regionsData, langDict };
  } catch (error) {
    logger.error('Error loading dictionaries:', error);
    return null;
  }
}

// Group missions by type for easier processing
function groupMissionsByType(
  fissureMissions: ActiveMission[], 
  regionsData: Record<string, RegionInfo>,
  langDict: Record<string, string>
): Record<string, ActiveMission[]> {
  const result: Record<string, ActiveMission[]> = {};
  
  // Log for debugging
  logger.debug(`Grouping ${fissureMissions.length} fissure missions by type`);
  
  fissureMissions.forEach(mission => {
    // Extract mission type from region data
    const nodeInfo = regionsData[mission.Node];
    let missionType = mission.MissionType; // Default fallback
    
    if (nodeInfo?.missionName) {
      // Get the actual mission name from the language dictionary
      const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
      
      // Extract just the mission type name (e.g., "Defense", "Survival", etc.)
      const missionTypeParts = translatedName.split('_');
      if (missionTypeParts.length > 0) {
        missionType = missionTypeParts[missionTypeParts.length - 1];
      }
    }
    
    // Clean up mission type name
    missionType = missionType.replace('MissionName_', '');
    
    // Special handling for Zariman missions with consistent naming 
    // These mission types come from the API and need to be standardized
    if (missionType === 'VoidCascade' || missionType.includes('Cascade')) {
      missionType = 'Void Cascade';
    }
    if (missionType === 'Corruption' || missionType.includes('Flood')) {
      missionType = 'Void Flood';
    }
    if (missionType === 'Armageddon' || missionType.includes('Armageddon')) {
      missionType = 'Void Armageddon';
    }
    
    // Add mission to the specific type group (use Title Case for consistency)
    const standardizedType = missionType
      .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    logger.debug(`Extracted mission type for ${mission.Node}: Original=${mission.MissionType}, Processed=${standardizedType}, Is Steel Path=${!!mission.Hard}`);
    
    // Initialize array if needed
    if (!result[standardizedType]) {
      result[standardizedType] = [];
    }
    
    // Add mission to the appropriate group
    result[standardizedType].push(mission);
  });
  
  // Log the final grouping
  logger.debug(`Grouped missions by ${Object.keys(result).length} types: ${Object.keys(result).join(', ')}`);
  
  return result;
}

// Find missions types with new fissures
function findNewFissureMissions(currentFissures: Record<string, ActiveMission[]>): string[] {
  // If this is the first check, consider all missions as new
  if (Object.keys(lastFissureList).length === 0) {
    return Object.keys(currentFissures);
  }
  
  const newMissionTypes: string[] = [];
  
  // Track expirations and new fissures for detailed logging
  console.log('=== CHECKING FOR NEW/EXPIRED FISSURES ===');
  console.log('Current mission types:', Object.keys(currentFissures));
  console.log('Last fissure list mission types:', Object.keys(lastFissureList));
  
  // 1. First, check for entirely new mission types that weren't present before
  for (const missionType of Object.keys(currentFissures)) {
    // Always consider special mission types like Void Cascade, Void Flood, Void Armageddon
    // as new so they always trigger notifications
    const missionTypeLower = missionType.toLowerCase();
    
    // If this is a special mission type, always include it
    let isSpecialMissionType = false;
    for (const specialType of SPECIAL_MISSION_TYPES) {
      if (missionTypeLower.includes(specialType)) {
        console.log(`SPECIAL MISSION TYPE: ${missionType} - always included for notification`);
        isSpecialMissionType = true;
        break;
      }
    }
    
    if (isSpecialMissionType) {
      // Always include special mission types, even if we've seen them before
      // Check if there are any missions of this type that haven't expired
      const currentMissions = currentFissures[missionType];
      const activeCount = currentMissions.filter(mission => {
        const expiryTime = parseInt(mission.Expiry.$date.$numberLong);
        return expiryTime > Date.now();
      }).length;
      
      console.log(`SPECIAL MISSION: ${missionType} has ${activeCount} active missions`);
      
      if (activeCount > 0) {
        // Get current mission IDs to help with logging
        const currentIds = currentMissions.map(m => m._id.$oid).join(',');
        console.log(`SPECIAL MISSION: ${missionType} IDs: ${currentIds}`);
        
        // Check if these are the same missions we've already notified about
        if (lastFissureList[missionType]) {
          const lastIds = lastFissureList[missionType].map(m => m._id.$oid).join(',');
          console.log(`PREVIOUS ${missionType} IDs: ${lastIds}`);
          
          // If IDs are different (or expiry times are different), consider it new
          if (currentIds !== lastIds) {
            console.log(`SPECIAL MISSION: ${missionType} has different IDs than last check - considering new`);
            newMissionTypes.push(missionType);
          } else {
            // Even if IDs match, check if this is a brand new run
            // Check if expiry times have changed
            const allExpiryMatch = currentMissions.every((current, idx) => {
              const lastMission = lastFissureList[missionType][idx];
              if (!lastMission) return false;
              
              const currentExpiry = current.Expiry.$date.$numberLong;
              const lastExpiry = lastMission.Expiry.$date.$numberLong;
              return currentExpiry === lastExpiry;
            });
            
            if (!allExpiryMatch) {
              console.log(`SPECIAL MISSION: ${missionType} has same IDs but different expiry times - considering new`);
              newMissionTypes.push(missionType);
            } else {
              console.log(`SPECIAL MISSION: ${missionType} has same IDs and expiry times - skipping`);
            }
          }
        } else {
          // No previous missions of this type
          console.log(`SPECIAL MISSION: ${missionType} - no previous missions of this type`);
          newMissionTypes.push(missionType);
        }
        
        continue;
      }
    }
    
    // For non-special mission types, use the original logic
    // Check if this mission type or a similar one existed previously
    const previousTypeExists = Object.keys(lastFissureList).some(prevType => {
      const prevTypeLower = prevType.toLowerCase();
      
      // Special handling for Cascade, Flood, and Armageddon missions
      if ((missionTypeLower.includes('cascade') && prevTypeLower.includes('cascade')) ||
          (missionTypeLower.includes('flood') && prevTypeLower.includes('flood')) ||
          (missionTypeLower.includes('armageddon') && prevTypeLower.includes('armageddon'))) {
        return true;
      }
      
      // For other mission types, check if they match exactly or contain each other
      return prevTypeLower === missionTypeLower ||
             prevTypeLower.includes(missionTypeLower) ||
             missionTypeLower.includes(prevTypeLower);
    });
    
    if (!previousTypeExists) {
      console.log(`NEW MISSION TYPE: ${missionType} - not found in previous list`);
      newMissionTypes.push(missionType);
      continue;
    }
  }
  
  // 2. Then check for new missions in existing types
  for (const missionType of Object.keys(currentFissures)) {
    // Skip if this type was already added to the notification list
    if (newMissionTypes.includes(missionType)) {
      continue;
    }
    
    // Skip special mission types since they were already handled
    const missionTypeLower = missionType.toLowerCase();
    let isSpecialMissionType = false;
    for (const specialType of SPECIAL_MISSION_TYPES) {
      if (missionTypeLower.includes(specialType)) {
        isSpecialMissionType = true;
        break;
      }
    }
    if (isSpecialMissionType) {
      continue;
    }
    
    // Find matching previous mission types
    const matchingPrevTypes = Object.keys(lastFissureList).filter(prevType => {
      const prevTypeLower = prevType.toLowerCase();
      
      // For non-special mission types, check if they match exactly or contain each other
      return prevTypeLower === missionTypeLower ||
             prevTypeLower.includes(missionTypeLower) ||
             missionTypeLower.includes(prevTypeLower);
    });
    
    if (matchingPrevTypes.length > 0) {
      // Create a map of previous mission IDs and their expiry timestamps
      const prevMissionsMap = new Map<string, number>();
      
      // Collect all IDs and expiry times from matching previous mission types
      for (const prevType of matchingPrevTypes) {
        lastFissureList[prevType].forEach(m => {
          const expiryTime = parseInt(m.Expiry.$date.$numberLong);
          prevMissionsMap.set(m._id.$oid, expiryTime);
        });
      }
      
      // Get current time in milliseconds
      const currentTime = Date.now();
      
      // Flag to track if we found any new missions
      let hasNewMissions = false;
      
      // Check each current mission to see if it's new or if a previous one expired
      for (const currentMission of currentFissures[missionType]) {
        const currentId = currentMission._id.$oid;
        
        // If the ID isn't in the previous list, it's definitely new
        if (!prevMissionsMap.has(currentId)) {
          console.log(`NEW MISSION: Found new ${missionType} mission with ID ${currentId}`);
          hasNewMissions = true;
          continue;
        }
        
        // Even if the ID is in the previous list, check if it's a back-to-back mission
        // (Same ID can sometimes be reused, so check expiry times too)
        const prevExpiryTime = prevMissionsMap.get(currentId)!;
        const currentExpiryTime = parseInt(currentMission.Expiry.$date.$numberLong);
        
        // If the expiry time changed or it's significantly different, it's a new mission
        if (prevExpiryTime !== currentExpiryTime && Math.abs(prevExpiryTime - currentExpiryTime) > 60000) {
          console.log(`BACK-TO-BACK MISSION: Found new ${missionType} mission with changed expiry time (previous: ${new Date(prevExpiryTime).toISOString()}, current: ${new Date(currentExpiryTime).toISOString()})`);
          hasNewMissions = true;
        }
      }
      
      // Check for expired missions (ones that were in the previous list but not in the current list)
      for (const [prevId, prevExpiry] of prevMissionsMap.entries()) {
        // If this mission ID isn't in the current missions, it might have expired
        const stillExists = currentFissures[missionType].some(m => m._id.$oid === prevId);
        
        if (!stillExists) {
          const expiryTime = new Date(prevExpiry).toISOString();
          
          // If it expired recently (within the last check interval plus some buffer)
          if (prevExpiry <= currentTime && prevExpiry > currentTime - (checkInterval * 2)) {
            console.log(`EXPIRED MISSION: ${missionType} mission with ID ${prevId} expired at ${expiryTime}`);
          }
        }
      }
      
      // If we have new missions, add the mission type to the notification list
    if (hasNewMissions) {
        console.log(`NEW MISSIONS: ${missionType} - mission ID or expiry time changed`);
      newMissionTypes.push(missionType);
      }
    }
  }
  
  console.log(`Mission types with new fissures: ${newMissionTypes.length > 0 ? newMissionTypes.join(', ') : 'None'}`);
  return newMissionTypes;
}

// Send notifications to configured channels for new fissures
async function sendFissureNotifications(
  client: Client, 
  notifications: FissureNotification[], 
  fissures: Record<string, ActiveMission[]>
): Promise<void> {
  // Direct console logs for major debugging
  console.log('==================================');
  console.log('FISSURE NOTIFICATION PROCESS START');
  console.log(`Notifications to process: ${notifications.length}`);
  console.log('Notification details:');
  notifications.forEach(n => {
    console.log(`ID: ${n.id}, Type: ${n.mission_type}, SteelPath: ${n.steel_path}, Guild: ${n.guild_id}, Channel: ${n.channel_id}`);
  });
  console.log('Available mission types:');
  console.log(Object.keys(fissures).join(', '));
  console.log('==================================');
  
  // Load dictionaries again for creating embeds
  const dictionaries = await loadDictionaries();
  if (!dictionaries) {
    console.error('CRITICAL ERROR: Failed to load mission dictionaries for notifications');
    logger.error('Failed to load mission dictionaries for notifications');
    return;
  }
  
  const { regionsData, langDict } = dictionaries;
  
  // For debugging: Log specific mission type details
  for (const [type, missions] of Object.entries(fissures)) {
    if (type.toLowerCase().includes('cascade') || 
        type.toLowerCase().includes('flood') || 
        type.toLowerCase().includes('armageddon')) {
      console.log(`DEBUG: Special mission type "${type}" details:`);
      console.log(`- Has ${missions.length} active missions`);
      console.log(`- Mission IDs: ${missions.map(m => m._id.$oid).join(', ')}`);
    }
  }
  
  // CHANGE: Track processed notifications to prevent duplicates
  // Use a Set to track unique mission type + channel combinations
  const processedNotifications = new Set<string>();
  
  // Group notifications by guild and channel to avoid sending multiple messages to the same channel
  const channelGroups = new Map<string, FissureNotification[]>();
  
  notifications.forEach(notification => {
    const key = `${notification.guild_id}:${notification.channel_id}`;
    if (!channelGroups.has(key)) {
      channelGroups.set(key, []);
    }
    channelGroups.get(key)!.push(notification);
  });
  
  console.log(`Channel groups: ${channelGroups.size}`);
  
  // Process each channel
  for (const [channelKey, channelNotifications] of channelGroups.entries()) {
    const [guildId, channelId] = channelKey.split(':');
    console.log(`Processing channel group: ${channelKey} with ${channelNotifications.length} notifications`);
    
    try {
      // Get the guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`CRITICAL: Guild ${guildId} not found, skipping notification`);
        logger.warn(`Guild ${guildId} not found, skipping notification`);
        continue;
      }
      
      // Get the channel
      const channel = await guild.channels.fetch(channelId).catch((): null => null);
      if (!channel || !(channel instanceof TextChannel)) {
        console.error(`CRITICAL: Channel ${channelId} in guild ${guildId} not found or not a text channel`);
        logger.warn(`Channel ${channelId} in guild ${guildId} not found or not a text channel`);
        continue;
      }
      
      console.log(`Successfully found channel: ${channel.name} (${channelId}) in guild: ${guild.name}`);
      
      // Process each notification for this channel
      for (const notification of channelNotifications) {
        console.log(`Processing notification: ${notification.id}, type: ${notification.mission_type}`);
        
        const missionType = notification.mission_type.toLowerCase();
        const steelPathOnly = notification.steel_path;
        
        // CHANGE: Create a unique key for this notification type + channel
        const notificationKey = `${channelKey}:${missionType}:${steelPathOnly}`;
        
        // CHANGE: Skip if we've already processed this notification type for this channel
        if (processedNotifications.has(notificationKey)) {
          console.log(`SKIP: Already processed a notification for ${missionType} (SP: ${steelPathOnly}) in this channel`);
          continue;
        }
        
        // Add to processed set
        processedNotifications.add(notificationKey);
        
        // Standardize and normalize mission type for consistent comparison
        const standardizedType = missionType
          .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        console.log(`Standardized mission type: "${standardizedType}", Steel Path only: ${steelPathOnly}`);
        console.log(`Available mission types for matching: ${Object.keys(fissures).join(', ')}`);
        
        // Case-insensitive lookup for mission types
        let relevantFissures: ActiveMission[] = [];
        
        // Try direct lookup first
        if (fissures[standardizedType]) {
          console.log(`DIRECT MATCH: Found ${fissures[standardizedType].length} fissures with type "${standardizedType}"`);
          relevantFissures = fissures[standardizedType];
        } else {
          // If not found directly, try case-insensitive search
          const missionTypeLower = standardizedType.toLowerCase().trim();
          
          // Try known mission types first with exact match
          for (const [type, missions] of Object.entries(fissures)) {
            const typeLower = type.toLowerCase().trim();
            
            if (typeLower === missionTypeLower) {
              relevantFissures = missions;
              console.log(`EXACT MATCH: Found ${relevantFissures.length} fissures with type "${type}"`);
              break;
            }
          }
          
          // If still not found, try special mission type handling
          if (relevantFissures.length === 0) {
            console.log(`Trying special mission type handling for "${missionTypeLower}"...`);
            
            // ENHANCED: Improved special handling for Cascade/Flood/Armageddon
            if (missionTypeLower.includes('cascade') || missionTypeLower.includes('void cascade')) {
              console.log(`SPECIAL DETECTION: Looking for Cascade fissures`);
              for (const [type, missions] of Object.entries(fissures)) {
                const typeLower = type.toLowerCase();
                if (typeLower.includes('cascade') || typeLower === 'voidcascade') {
                  console.log(`CASCADE MATCH: Found fissures with type "${type}"`);
                  relevantFissures = [...relevantFissures, ...missions];
                }
              }
              
              if (relevantFissures.length > 0) {
                console.log(`SPECIAL CASCADE: Found total of ${relevantFissures.length} Cascade fissures`);
              }
            } 
            else if (missionTypeLower.includes('flood') || missionTypeLower.includes('void flood')) {
              console.log(`SPECIAL DETECTION: Looking for Flood fissures`);
              for (const [type, missions] of Object.entries(fissures)) {
                const typeLower = type.toLowerCase();
                if (typeLower.includes('flood') || typeLower === 'corruption') {
                  console.log(`FLOOD MATCH: Found fissures with type "${type}"`);
                  relevantFissures = [...relevantFissures, ...missions];
                }
              }
              
              if (relevantFissures.length > 0) {
                console.log(`SPECIAL FLOOD: Found total of ${relevantFissures.length} Flood fissures`);
              }
            } 
            else if (missionTypeLower.includes('armageddon') || missionTypeLower.includes('void armageddon')) {
              console.log(`SPECIAL DETECTION: Looking for Armageddon fissures`);
              for (const [type, missions] of Object.entries(fissures)) {
                const typeLower = type.toLowerCase();
                if (typeLower.includes('armageddon')) {
                  console.log(`ARMAGEDDON MATCH: Found fissures with type "${type}"`);
                  relevantFissures = [...relevantFissures, ...missions];
                }
              }
              
              if (relevantFissures.length > 0) {
                console.log(`SPECIAL ARMAGEDDON: Found total of ${relevantFissures.length} Armageddon fissures`);
              }
            } else {
              // Try fuzzy matching for other types
              for (const [type, missions] of Object.entries(fissures)) {
                const typeLower = type.toLowerCase().trim();
                if (typeLower.includes(missionTypeLower) || missionTypeLower.includes(typeLower)) {
                  console.log(`FUZZY MATCH: Found ${missions.length} fissures with partial match: "${type}" for "${missionType}"`);
                  relevantFissures = [...relevantFissures, ...missions];
                }
              }
            }
          }
        }
        
        if (relevantFissures.length === 0) {
          console.error(`ERROR: No matching fissures found for mission type "${missionType}" (standardized: "${standardizedType}")`);
          console.error(`Available types in current fissures: ${Object.keys(fissures).join(', ')}`);
          console.error(`SKIPPING this notification`);
          continue;
        }
        
        // Filter by Steel Path setting if specified
        const initialCount = relevantFissures.length;
        if (steelPathOnly) {
          console.log(`Filtering ${initialCount} fissures for Steel Path only`);
          relevantFissures = relevantFissures.filter(mission => mission.Hard);
          console.log(`After filtering: ${relevantFissures.length} Steel Path fissures remain`);
        } else if (notification.steel_path === false) {
          // Explicitly false (not undefined) means exclude Steel Path
          console.log(`Filtering ${initialCount} fissures to exclude Steel Path`);
          relevantFissures = relevantFissures.filter(mission => !mission.Hard);
          console.log(`After filtering: ${relevantFissures.length} normal fissures remain`);
        }
        
        if (relevantFissures.length === 0) {
          console.error(`ERROR: No matching fissures remain after Steel Path filtering`);
          console.error(`SKIPPING this notification`);
          continue;
        }
        
        // Create a more comprehensive signature for these missions, including IDs and expiry times
        const missionIds = relevantFissures.map(m => m._id.$oid).sort().join(',');
        const missionExpiryTimes = relevantFissures.map(m => m.Expiry.$date.$numberLong).sort().join(',');
        
        console.log(`Current mission IDs: ${missionIds}`);
        console.log(`Current mission expiry times: ${missionExpiryTimes}`);
        console.log(`Last notified IDs: ${notification.last_notified || 'None'}`);
        
        // Check if we're re-notifying the same missions
        if (notification.last_notified === missionIds) {
          console.log(`SKIP: Already notified about these exact mission IDs - no need to send another notification`);
          continue;
        }
        
        // Generate a more robust deduplication identifier that includes expiry times
        const getMissionIdentifier = (mission: ActiveMission) => {
          // Only use node, modifier, and hard status for identification, NOT expiry time
          // This prevents treating the same mission with a different countdown as a new mission
          return `${mission.Node}-${mission.Modifier}-${mission.Hard}`;
        };
        
        const missionIdentifiers = relevantFissures.map(mission => getMissionIdentifier(mission)).sort().join(',');
        const dedupeKey = `${channelId}:${missionType}:${steelPathOnly}`;
        const lastNotifiedForThisConfig = recentlyNotifiedMissions.get(dedupeKey);

        // Compare the current missions with what we've already notified about in this session
        // If they match exactly, skip notification
        if (lastNotifiedForThisConfig === missionIdentifiers) {
          console.log(`SKIP: Already sent notification for these exact missions recently in this session, skipping duplicate`);
          continue;
        }
        
        // Format the mission names based on their type
        const formattedFissures = formatFissuresForDisplay(relevantFissures, regionsData, langDict);
        
        if (formattedFissures.length === 0) {
          logger.warn(`No fissures to display for ${missionType} (${steelPathOnly ? 'Steel Path' : 'Normal'})`);
          continue;
        }
        
        // Create embed
        const embed = createEmbed({
            type: 'info',
          title: `${steelPathOnly ? 'Steel Path' : 'Normal'} ${missionType} Void Fissures`,
          description: formattedFissures.join('\n'),
          thumbnail: 'https://browse.wf/Lotus/Interface/icons/Store/OrokinStoreTearC.png',
          footer: `Fissure notification for ${guild.name}`,
            timestamp: true
        });
        
        // Add role mention if configured
        let content = '';
        if (notification.role_id) {
          content = `<@&${notification.role_id}> ${steelPathOnly ? 'Steel Path' : 'Normal'} ${missionType} fissures available!`;
        }
        
        let messageId: string | undefined = notification.message_id;
        
        // Always create new messages for all fissure types to ensure role pings occur
        console.log(`Creating new message for fissure type: ${missionType} to ensure role pings occur`);
        
        // Send a new message
        const newMessage = await channel.send({ 
          content: content.length > 0 ? content : null, 
          embeds: [embed]
        });
        
        // Store the new message ID
        messageId = newMessage.id;
        
        logger.info(`Sent new notification message for ${steelPathOnly ? 'Steel Path' : 'Normal'} ${missionType} in ${guild.name} (${channel.name})`);

        // IMPORTANT FIX: Store mission IDs in last_notified instead of a timestamp 
        await pgdb.query(
          'UPDATE fissure_notifications SET last_notified = $1, message_id = $2, updated_at = NOW() WHERE id = $3',
          [missionIds, messageId, notification.id]
        );
        
        // Update the cache with the new mission identifier string to prevent duplicates
        recentlyNotifiedMissions.set(dedupeKey, missionIdentifiers);
        
        logger.info(`Sent/updated ${steelPathOnly ? 'Steel Path' : 'Normal'} ${missionType} fissure notification to ${guild.name} (${channel.name})`);
      }
    } catch (error) {
      console.error(`ERROR processing channel ${channelId}:`, error);
      logger.error(`Error sending fissure notification to channel ${channelId}:`, error);
    }
  }

  // Clean up old entries from the recentlyNotifiedMissions map to prevent memory leaks
  if (recentlyNotifiedMissions.size > 100) {
    const keysToDelete = [...recentlyNotifiedMissions.keys()].slice(0, recentlyNotifiedMissions.size - 100);
    keysToDelete.forEach(key => recentlyNotifiedMissions.delete(key));
  }
}

// Format fissure missions for display in notifications
function formatFissuresForDisplay(
  missions: ActiveMission[],
  regionsData: Record<string, RegionInfo>,
  langDict: Record<string, string>
): string[] {
  return missions.map(mission => {
    const nodeInfo = regionsData[mission.Node];
    const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : mission.Node;
    const translatedSystem = nodeInfo?.systemName ? (langDict[nodeInfo.systemName] || nodeInfo.systemName) : 'Unknown';
    const factionName = nodeInfo?.factionName ? (langDict[nodeInfo.factionName] || nodeInfo.factionName) : 'Unknown';
    
    const relicTier = VOID_TIER_MAP[mission.Modifier] || 'Unknown';
    const expiryDate = new Date(parseInt(mission.Expiry.$date.$numberLong));
    const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000);
    
    // Get mission type
    let missionType = mission.MissionType;
    if (nodeInfo?.missionName) {
      const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
      const missionTypeParts = translatedName.split('_');
      if (missionTypeParts.length > 0) {
        missionType = missionTypeParts[missionTypeParts.length - 1].replace('MissionName_', '');
      }
    }
    
    // Standardize mission type for display
    if (missionType === 'VoidCascade') missionType = 'Void Cascade';
    if (missionType === 'Corruption') missionType = 'Void Flood';
    if (missionType === 'Armageddon') missionType = 'Void Armageddon';
    
    // Format according to new template
    return [
      `**Faction:** ${factionName}`,
      `**Steel Path:** ${mission.Hard ? '✅' : '❌'}`,
      `**Type:** ${missionType}`,
      `**Expires:** <t:${expiryTimestamp}:R>`
    ].join('\n');
  });
}

// Helper function to get faction icons
function getFactionIcon(factionName: string): string {
  const lowerFaction = factionName.toLowerCase();
  if (lowerFaction.includes('grineer')) return ':InvasionGrineer:';
  if (lowerFaction.includes('corpus')) return ':InvasionCorpus:';
  if (lowerFaction.includes('infest')) return ':InvasionInfested:';
  if (lowerFaction.includes('orokin')) return ':InvasionOrokin:';
  if (lowerFaction.includes('sentient')) return ':InvasionSentient:';
  return '';
}

// Regular exports
export async function fetchFissures(): Promise<Record<string, ActiveMission[]> | null> {
  try {
    // Fetch current world state for fissure missions
    const response = await axios.get<ApiResponse>('https://oracle.browse.wf/worldState.json', {
      timeout: 10000,
      headers: {
        'User-Agent': 'KorptairBot/1.0.0'
      }
    });

    const { ActiveMissions } = response.data;
    if (!ActiveMissions || ActiveMissions.length === 0) {
      return null;
    }

    // Filter only void fissure missions
    const fissureMissions = ActiveMissions.filter(mission => mission.Modifier && mission.Modifier.startsWith('VoidT'));
    if (fissureMissions.length === 0) {
      return null;
    }

    // Load dictionaries for translation
    const dictionaries = await loadDictionaries();
    if (!dictionaries) {
      return null;
    }

    // Group by mission type for easier comparison and notification
    return groupMissionsByType(fissureMissions, dictionaries.regionsData, dictionaries.langDict);
  } catch (error) {
    logger.error('Error fetching fissures:', error);
    return null;
  }
}

export async function manualFissureCheck(client: Client): Promise<void> {
  // Reuse the existing function for manual checks
  triggerFissureCheck(client);
}

// New export function to check for existing fissures right after setup
export async function checkFissuresForSetup(
  client: Client,
  guildId: string,
  channelId: string,
  missionType: string,
  steelPath: boolean,
  setupMessageId: string
): Promise<void> {
  try {
    // Get the latest fissures using our fetchFissures function
    const fissures = await fetchFissures();
    if (!fissures) {
      logger.warn('Failed to fetch fissures for setup check');
      return;
    }
    
    // Standardize mission type for matching
    const standardizedType = missionType
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
      
    // Try to find matching fissures
    let relevantFissures: ActiveMission[] = [];
    
    // Try exact match first
    if (fissures[standardizedType]?.length) {
      relevantFissures = fissures[standardizedType];
    } else {
      // Try case insensitive match
      const missionTypeLower = standardizedType.toLowerCase().trim();
      
      // Look for special mission types
      if (missionTypeLower.includes('void cascade') || missionTypeLower.includes('cascade')) {
        for (const [type, missions] of Object.entries(fissures)) {
          if (type.toLowerCase().includes('cascade')) {
            relevantFissures = [...relevantFissures, ...missions];
          }
        }
      } else if (missionTypeLower.includes('void flood') || missionTypeLower.includes('flood')) {
        for (const [type, missions] of Object.entries(fissures)) {
          if (type.toLowerCase().includes('flood')) {
            relevantFissures = [...relevantFissures, ...missions];
          }
        }
      } else if (missionTypeLower.includes('void armageddon') || missionTypeLower.includes('armageddon')) {
        for (const [type, missions] of Object.entries(fissures)) {
          if (type.toLowerCase().includes('armageddon')) {
            relevantFissures = [...relevantFissures, ...missions];
          }
        }
      } else {
        // Try partial matching for other types
        for (const [type, missions] of Object.entries(fissures)) {
          const typeLower = type.toLowerCase().trim();
          if (typeLower.includes(missionTypeLower) || missionTypeLower.includes(typeLower)) {
            relevantFissures = [...relevantFissures, ...missions];
          }
        }
      }
    }
    
    // Filter by Steel Path setting if needed
    if (steelPath) {
      relevantFissures = relevantFissures.filter(mission => mission.Hard);
    }
    
    // If we found matching fissures, delete the setup message
    if (relevantFissures.length > 0) {
      logger.info(`Found ${relevantFissures.length} matching fissures after setup, deleting setup message`);
      
      // Get the guild and channel
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        logger.warn(`Guild ${guildId} not found for setup cleanup`);
        return;
      }
      
      const channel = await guild.channels.fetch(channelId).catch((): null => null);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.warn(`Channel ${channelId} not found or not a text channel for setup cleanup`);
        return;
      }
      
      // Try to fetch and delete the setup message
      try {
        const setupMessage = await channel.messages.fetch(setupMessageId);
        if (setupMessage) {
          await setupMessage.delete();
          logger.info(`Deleted setup message ${setupMessageId} as fissures already exist`);
        }
      } catch (err) {
        logger.error(`Error deleting setup message: ${err instanceof Error ? err.message : String(err)}`);
      }
      
      // Trigger an immediate check to send the actual fissure notifications
      setTimeout(function(): void {
        triggerFissureCheck(client);
      }, 1000);
    }
  } catch (error) {
    logger.error('Error in checkFissuresForSetup:', error);
  }
}

// Add a notification to listen for specific fissure types
export async function addFissureNotification(
  guildId: string,
  channelId: string,
  missionType: string,
  steelPath: boolean,
  roleId?: string
): Promise<{ success: boolean, id?: string, error?: string }> {
  try {
    // Add notification to database
    const notification = await pgdb.addFissureNotification(
      guildId,
      channelId,
      missionType,
      steelPath,
      roleId || null
    );
    
    logger.info(`Added new fissure notification: ${guildId}/${channelId} - ${missionType} (Steel Path: ${steelPath})`);
    return { success: true, id: notification.id };
  } catch (error) {
    logger.error('Error adding fissure notification:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Remove a notification
export async function removeFissureNotification(id: string): Promise<boolean> {
  try {
    await pgdb.removeFissureNotification(id);
    return true;
  } catch (error) {
    console.error('Error removing fissure notification:', error);
    return false;
  }
}

// List all notifications for a guild
export async function listFissureNotifications(
  guildId: string
): Promise<FissureNotification[]> {
  try {
    const allNotifications = await pgdb.getFissureNotifications();
    return allNotifications.filter(notification => notification.guild_id === guildId);
  } catch (error) {
    logger.error('Error listing fissure notifications:', error);
    return [];
  }
}

// New function to reset fissure cache for special mission types
export async function resetFissureCacheForMissionType(missionType: string): Promise<boolean> {
  // Skip if no last fissure list exists
  if (!lastFissureList) {
    logger.info(`resetFissureCacheForMissionType: No lastFissureList exists yet, nothing to reset`);
    return false;
  }

  // Normalize mission type to lowercase for case-insensitive comparison
  const missionTypeLower = missionType.toLowerCase();
  
  // Check if this is a special mission type we need to handle
  const isSpecialMissionType = SPECIAL_MISSION_TYPES.some(specialType => 
    missionTypeLower.includes(specialType)
  );
  
  if (!isSpecialMissionType) {
    logger.info(`resetFissureCacheForMissionType: ${missionType} is not a special mission type, skipping reset`);
    return false;
  }
  
  // Find the mission types in the last fissure list that match this type
  const matchingTypes = Object.keys(lastFissureList).filter(type => 
    type.toLowerCase().includes(missionTypeLower)
  );
  
  if (matchingTypes.length === 0) {
    logger.info(`resetFissureCacheForMissionType: No matching types found for ${missionType}`);
    return false;
  }
  
  // Remove these mission types from the last fissure list to force notifications
  matchingTypes.forEach(type => {
    logger.info(`resetFissureCacheForMissionType: Removing ${type} from lastFissureList to force notification`);
    if (lastFissureList && lastFissureList[type]) {
      delete lastFissureList[type];
    }
  });
  
  logger.info(`resetFissureCacheForMissionType: Successfully reset cache for ${missionType}, forcing notification on next check`);
  return true;
}