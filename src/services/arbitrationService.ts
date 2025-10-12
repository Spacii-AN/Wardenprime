import { Client, TextChannel } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';
import { createEmbed } from '../utils/embedBuilder';

// Tier emoji mappings (copied from arby.ts command)
const TIER_EMOJIS: Record<string, string> = {
  'S': '<:S_:1362400790160871574>',
  'A': '<:A_:1362400688599994461>',
  'B': '<:B_:1362400717444481094>',
  'C': '<:C_:1362400738852208722>',
  'D': '<:D_:1362400752869572829>',
  'F': '<:F_:1362400771521646725>'
};

// Interfaces
export interface ArbitrationEntry {
  timestamp: number;
  node: string;
}

interface NodeInfo {
  name: string;
  systemName: string;
  missionName: string;
  factionName: string;
  [key: string]: any;
}

interface ArbitrationDetail {
  timestamp: number;
  endTimestamp: number;
  node: string;
  nodeName: string;
  systemName: string;
  missionType: string;
  faction: string;
  tier: string;
  isActive: boolean;
}

// Updated interface to match the PostgreSQL schema
interface ArbitrationNotification {
  id: string;
  guild_id: string;
  channel_id: string;
  role_id?: string | null;
  message_id?: string | null;
  s_tier_role_id?: string | null;
  a_tier_role_id?: string | null;
  b_tier_role_id?: string | null;
  c_tier_role_id?: string | null;
  d_tier_role_id?: string | null;
  f_tier_role_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

// Global state to track the current arbitration
let currentArbitration: ArbitrationDetail | null = null;
let lastCheckTime = 0;
let checkInterval = 30000; // 30 seconds initial check interval
const MAX_CHECK_INTERVAL = 60000; // 1 minute maximum interval
let errorCount = 0;
let isFirstRun = true; // Flag for first run after startup

// Initialize the arbitration service
export async function initArbitrationService(client: Client): Promise<void> {
  logger.info('Initializing Arbitration notification service');
  
  // Start the periodic check
  await checkAndNotify(client);
}

// Main function to check for updates and send notifications
async function checkAndNotify(client: Client): Promise<void> {
  try {
    // Don't run checks too frequently
    const now = Date.now();
    if (now - lastCheckTime < 10000) { // At least 10 seconds between checks
      logger.debug('Skipping arbitration check - ran too recently');
      setTimeout(() => checkAndNotify(client), 10000);
      return;
    }
    
    lastCheckTime = now;
    
    // Check for new arbitrations
    const arbyData = await fetchArbitrationData();
    
    if (!arbyData) {
      logger.warn('Failed to fetch arbitration data, will retry later');
      scheduleNextCheck(client);
      return;
    }
    
    // Get the current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Find current arbitration
    const currentIndex = arbyData.findIndex((arby) => 
      arby.timestamp <= currentTime && currentTime < arby.timestamp + 3600
    );
    
    if (currentIndex === -1) {
      logger.warn('Could not determine current arbitration from data');
      scheduleNextCheck(client);
      return;
    }
    
    // Get detailed information about the current arbitration
    const arbyDetails = await processArbitrationData(arbyData[currentIndex]);
    
    // Check if this is a new arbitration
    if (!currentArbitration || currentArbitration.timestamp !== arbyDetails.timestamp) {
      logger.info(`New arbitration detected: ${arbyDetails.nodeName} (${arbyDetails.missionType})`);
      
      // On first run, check if we've already sent a notification for this arbitration
      if (isFirstRun) {
        logger.info('First run after startup: checking if we already notified about the current arbitration');
        isFirstRun = false;
        
        try {
          // Check if we've recently sent notifications for this arbitration
          // by checking for message history in configured channels
          const arbyChannels = await pgdb.getArbitrationNotifications();
          
          if (arbyChannels.length > 0) {
            // We'll check a sample channel to see if we already sent a notification
            const sampleChannel = arbyChannels[0];
            
            try {
              const guild = client.guilds.cache.get(sampleChannel.guild_id);
              if (guild) {
                const channel = await guild.channels.fetch(sampleChannel.channel_id).catch((): null => null);
                if (channel && channel instanceof TextChannel) {
                  // Get recent messages in the channel
                  const recentMessages = await channel.messages.fetch({ limit: 20 });
                  
                  // Check if any of them contain the current arbitration's node
                  const foundNotification = recentMessages.some(message => {
                    // Only check bot messages with embeds
                    if (message.author.bot && message.embeds.length > 0) {
                      const embed = message.embeds[0];
                      // Check if the embed title contains the node name
                      if (embed.title && embed.title.includes(arbyDetails.nodeName)) {
                        return true;
                      }
                    }
                    return false;
                  });
                  
                  if (foundNotification) {
                    logger.info(`Found existing notification for current arbitration (${arbyDetails.nodeName}), skipping notification`);
                    currentArbitration = arbyDetails; // Update current arby but skip notification
                    scheduleNextCheck(client);
                    return;
                  }
                }
              }
            } catch (err) {
              logger.error('Error checking for existing arbitration messages:', err);
              // Continue with notification if check fails
            }
          }
        } catch (dbErr) {
          logger.error('Error accessing database for startup check:', dbErr);
          // Continue with notification if check fails
        }
      }
      
      // Update the current arbitration
      currentArbitration = arbyDetails;
      
      // Send notifications to configured channels
      await sendArbitrationNotifications(client, arbyDetails);
    }
    
    // Reset error count and interval on success
    if (errorCount > 0) {
      errorCount = Math.max(0, errorCount - 1);
      if (checkInterval > 30000) {
        checkInterval = Math.max(30000, checkInterval / 2);
        logger.info(`Reducing arbitration check interval to ${checkInterval}ms after successful check`);
      }
    }
    
    // Calculate time until next arbitration
    const timeUntilNext = (arbyDetails.endTimestamp - currentTime) * 1000;
    
    // If the next arbitration is soon, check more frequently
    if (timeUntilNext < 5 * 60 * 1000) { // less than 5 minutes
      logger.info(`Next arbitration in ${Math.floor(timeUntilNext / 60000)} minutes, scheduling more frequent checks`);
      setTimeout(() => checkAndNotify(client), Math.min(30000, timeUntilNext / 2));
    } else {
      scheduleNextCheck(client);
    }
  } catch (error) {
    errorCount++;
    logger.error(`Error in arbitration service (error #${errorCount}):`, error);
    
    // Implement exponential backoff if errors persist
    if (errorCount > 2) {
      const previousInterval = checkInterval;
      checkInterval = Math.min(checkInterval * 2, MAX_CHECK_INTERVAL);
      if (previousInterval !== checkInterval) {
        logger.warn(`Increasing arbitration check interval to ${checkInterval}ms due to persistent errors`);
      }
    }
    
    scheduleNextCheck(client);
  }
}

// Schedule the next check
function scheduleNextCheck(client: Client): void {
  setTimeout(() => checkAndNotify(client), checkInterval);
}

// Fetch arbitration data from the API
export async function fetchArbitrationData(): Promise<ArbitrationEntry[] | null> {
  try {
    logger.debug('Fetching arbitration data from browse.wf');
    const response = await axios.get('https://browse.wf/arbys.txt', {
      timeout: 10000,
      headers: {
        'User-Agent': 'WardenPrimeBot/1.0.0'
      }
    });
    
    const arbitrationsText = response.data as string;
    
    // Parse the arbitrations data
    const arbitrations = arbitrationsText.split('\n')
      .filter((line: string) => line.trim() !== '')
      .map((line: string) => {
        const [timestamp, node] = line.split(',');
        return {
          timestamp: parseInt(timestamp),
          node: node.trim()
        } as ArbitrationEntry;
      })
      .filter((arby: ArbitrationEntry) => arby.timestamp && arby.node);
    
    logger.debug(`Found ${arbitrations.length} arbitration entries`);
    return arbitrations;
  } catch (error) {
    logger.error('Error fetching arbitration data:', error);
    return null;
  }
}

// Process the arbitration data to get detailed information
export async function processArbitrationData(arbyEntry: ArbitrationEntry): Promise<ArbitrationDetail> {
  try {
    // Load arby tiers
    const arbyTiersPath = path.join(process.cwd(), 'src', 'data', 'arby_tiers.json');
    const arbyTiers = JSON.parse(await fs.promises.readFile(arbyTiersPath, 'utf8')) as Record<string, string>;
    
    // Load regions data for node information
    const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
    const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, NodeInfo>;
    
    // Load language dictionary for translations
    const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
    const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
    
    // Get node info
    const nodeInfo = regionsData[arbyEntry.node];
    if (!nodeInfo) {
      logger.warn(`Node info not found for ${arbyEntry.node}`);
      return {
        timestamp: arbyEntry.timestamp,
        endTimestamp: arbyEntry.timestamp + 3600,
        node: arbyEntry.node,
        nodeName: 'Unknown',
        systemName: 'Unknown',
        missionType: 'Unknown',
        faction: 'Unknown',
        tier: arbyTiers[arbyEntry.node] || 'F',
        isActive: true
      };
    }
    
    // Translate node name, mission type, and faction
    const nodeName = langDict[nodeInfo.name] || nodeInfo.name;
    const systemName = langDict[nodeInfo.systemName] || nodeInfo.systemName;
    const missionType = langDict[nodeInfo.missionName] || nodeInfo.missionName;
    const faction = langDict[nodeInfo.factionName] || nodeInfo.factionName;
    
    return {
      timestamp: arbyEntry.timestamp,
      endTimestamp: arbyEntry.timestamp + 3600,
      node: arbyEntry.node,
      nodeName,
      systemName,
      missionType,
      faction,
      tier: arbyTiers[arbyEntry.node] || 'F',
      isActive: true
    };
  } catch (error) {
    logger.error('Error processing arbitration data:', error);
    return {
      timestamp: arbyEntry.timestamp,
      endTimestamp: arbyEntry.timestamp + 3600,
      node: arbyEntry.node,
      nodeName: 'Unknown',
      systemName: 'Unknown',
      missionType: 'Unknown',
      faction: 'Unknown',
      tier: 'F',
      isActive: true
    };
  }
}

// Send notifications to all configured channels
async function sendArbitrationNotifications(client: Client, arbyDetails: ArbitrationDetail): Promise<void> {
  try {
    // Get all configured channels from PostgreSQL
    const arbyChannels = await pgdb.getArbitrationNotifications();
    
    if (arbyChannels.length === 0) {
      logger.info('No channels configured for arbitration notifications');
      return;
    }
    
    // Create a map of guild IDs to channel configs to ensure uniqueness
    // This prevents duplicate messages if multiple configurations exist for the same guild
    const guildChannelMap = new Map<string, ArbitrationNotification>();
    
    // Use only the most recently updated configuration for each guild
    for (const config of arbyChannels) {
      const existingConfig = guildChannelMap.get(config.guild_id);
      
      if (!existingConfig || config.updated_at > existingConfig.updated_at) {
        guildChannelMap.set(config.guild_id, config);
      }
    }
    
    logger.info(`Sending arbitration notifications to ${guildChannelMap.size} channels`);
    
    // Fetch arbitration data for upcoming and noteworthy sections
    const arbyData = await fetchArbitrationData();
    if (!arbyData) {
      logger.error('Failed to fetch arbitration data for notifications');
      return;
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Find current arbitration index
    const currentIndex = arbyData.findIndex((arby) => 
      arby.timestamp <= currentTime && currentTime < arby.timestamp + 3600
    );
    
    if (currentIndex === -1) {
      logger.error('Could not determine current arbitration for notifications');
      return;
    }
    
    // Get the next 3 arbitrations for upcoming section
    const upcomingArbitrations = await Promise.all(
      arbyData.slice(currentIndex + 1, currentIndex + 4)
        .map(arby => processArbitrationData(arby))
    );
    
    // Get arbitrations for next two weeks for noteworthy section
    const twoWeeksEndIndex = arbyData.findIndex((arby) => arby.timestamp > currentTime + (14 * 86400)) || arbyData.length;
    
    const twoWeeksArbitrations = await Promise.all(
      arbyData.slice(currentIndex + 1, twoWeeksEndIndex)
        .map(arby => processArbitrationData(arby))
    );
    
    // Find all S and A tier arbitrations in the next two weeks
    // Skip the current and immediate upcoming ones that are already displayed
    const upcomingIds = new Set([arbyDetails.node, ...upcomingArbitrations.map(a => a.node)]);
    
    const noteworthyArbitrations = twoWeeksArbitrations
      .filter(arby => (arby.tier === 'S' || arby.tier === 'A') && !upcomingIds.has(arby.node))
      .slice(0, 5); // Limit to 5 to avoid too long embed
    
    // Create the embed for the notification
    const arbyEmbed = createEmbed({
      type: 'info',
      title: `${arbyDetails.tier} Tier | ${arbyDetails.nodeName} (${arbyDetails.systemName})`,
      description: `Arbi Ends <t:${arbyDetails.endTimestamp}:R>`,
      fields: [
        {
          name: 'Enemy',
          value: arbyDetails.faction,
          inline: true
        },
        {
          name: 'Mission type',
          value: arbyDetails.missionType,
          inline: true
        },
        {
          name: 'Upcoming Arbitrations',
          value: upcomingArbitrations.length > 0 
            ? upcomingArbitrations.map(arby => 
              `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
            ).join('\n')
            : 'No upcoming arbitrations found',
          inline: false
        },
        {
          name: 'Noteworthy Arbitrations',
          value: noteworthyArbitrations.length > 0 
            ? noteworthyArbitrations.map(arby => 
              `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
            ).join('\n')
            : 'No noteworthy arbitrations found in the next two weeks',
          inline: false
        }
      ],
      thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Resources/CraftingComponents/Elitium.png',
      timestamp: true
    });
    
    // Send to each channel
    for (const channelConfig of guildChannelMap.values()) {
      try {
        // Get the guild
        const guild = client.guilds.cache.get(channelConfig.guild_id);
        if (!guild) {
          logger.warn(`Guild ${channelConfig.guild_id} not found, skipping notification`);
          continue;
        }
        
        // Get the channel
        const channel = await guild.channels.fetch(channelConfig.channel_id).catch((): null => null);
        if (!channel || !(channel instanceof TextChannel)) {
          logger.warn(`Channel ${channelConfig.channel_id} in guild ${channelConfig.guild_id} not found or not a text channel`);
          continue;
        }
        
        // Check if we should ping any roles based on the current arbitration tier
        let mentionString = '';
        
        // Only add role pings if configured and only for the current tier
        const tierRoleField = `${arbyDetails.tier.toLowerCase()}_tier_role_id` as keyof ArbitrationNotification;
        const tierRoleId = channelConfig[tierRoleField];
        
        if (tierRoleId) {
          mentionString += `<@&${tierRoleId}> ${arbyDetails.tier} Tier Arbitration is active!\n`;
        }
        
        // Send the notification with role pings if applicable
        if (mentionString) {
          await channel.send({ content: mentionString, embeds: [arbyEmbed] });
        } else {
          await channel.send({ embeds: [arbyEmbed] });
        }
        
        logger.info(`Sent arbitration notification to channel ${channel.name} (${channel.id}) in guild ${guild.name}`);
      } catch (channelError) {
        logger.error(`Error sending notification to channel ${channelConfig.channel_id}:`, channelError);
      }
    }
  } catch (error) {
    logger.error('Error sending arbitration notifications:', error);
  }
}