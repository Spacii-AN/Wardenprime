import { Client, TextChannel } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';
import { createEmbed } from '../utils/embedBuilder';

// Get environment variable for logging
const ENABLE_SERVICE_LOGS = process.env.ENABLE_AYA_SERVICE_LOGS === 'true';

// Custom logger that respects the service logging setting
const serviceLogger = {
  debug: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.debug(`[Aya] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.info(`[Aya] ${message}`, ...args);
    }
  },
  // Always log warnings and errors
  warn: (message: string, ...args: any[]) => {
    logger.warn(`[Aya] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    logger.error(`[Aya] ${message}`, ...args);
  }
};

// Interfaces
interface AyaChannel {
  guildId: string;
  channelId: string;
  roleId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BountyInfo {
  name: string;
  description: string;
  icon: string;
  stages: Array<Array<string>>;
}

interface AyaBountyData {
  ayaTents: Record<string, Array<string>>;
  expiryTimestamp: number;
}

// Global state and constants
let isServiceRunning = false;
let lastExpiryTimestamp = 0;
let checkInterval = 60000; // Check every minute
let isFirstRun = true; // Flag to track first run after startup
const AYA_BOUNTIES = [
  "/Lotus/Types/Gameplay/Eidolon/Jobs/ReclamationBountyCap",
  "/Lotus/Types/Gameplay/Eidolon/Jobs/ReclamationBountyCache"
];

// Initialize the Aya service
export function startAyaService(client: Client): void {
  if (isServiceRunning) {
    serviceLogger.debug('Aya service is already running');
    return;
  }
  
  serviceLogger.info('Starting Aya bounty notification service');
  isServiceRunning = true;
  
  // Start checking for updates
  checkAndUpdate(client);
}

// Main function to check for updates and update messages
async function checkAndUpdate(client: Client): Promise<void> {
  try {
    // Fetch current Aya bounty data
    const { ayaTents, expiryTimestamp } = await fetchAyaBountyData();
    
    // If the expiry timestamp is different from the last one we processed,
    // it means the bounties have reset and we need to update all messages
    if (lastExpiryTimestamp !== 0 && expiryTimestamp !== lastExpiryTimestamp) {
      serviceLogger.info(`Bounty rotation detected! Old expiry: ${lastExpiryTimestamp}, New expiry: ${expiryTimestamp}`);
      await updateAllMessages(client, ayaTents, expiryTimestamp);
    } else if (lastExpiryTimestamp === 0) {
      // First run, update all messages
      serviceLogger.info(`Initial Aya bounty check, setting expiry to ${expiryTimestamp}`);
      
      // On first run, check if we've already sent a notification for this rotation
      if (isFirstRun) {
        serviceLogger.info('First run after startup: checking if we already notified about the current Aya bounties');
        isFirstRun = false;
        
        try {
          // Check if we've recently sent notifications for this rotation
          // by checking for message history in configured channels
          const ayaChannels = await pgdb.getAyaNotifications();
          
          if (ayaChannels.length > 0) {
            // We'll check a sample channel to see if we already sent a notification
            const sampleChannel = ayaChannels[0];
            
            try {
              const guild = client.guilds.cache.get(sampleChannel.guild_id);
              if (guild) {
                const channel = await guild.channels.fetch(sampleChannel.channel_id).catch((): null => null);
                if (channel && channel instanceof TextChannel) {
                  // Get recent messages in the channel
                  const recentMessages = await channel.messages.fetch({ limit: 20 });
                  
                  // Check if any of them contain the current bounty information and expiry time
                  const foundNotification = recentMessages.some(message => {
                    // Only check bot messages with embeds
                    if (message.author.bot && message.embeds.length > 0) {
                      const embed = message.embeds[0];
                      // Check if the embed description mentions the current expiry time
                      if (embed.description && embed.description.includes(`Reset <t:${Math.floor(expiryTimestamp)}:`)) {
                        serviceLogger.info('Found existing message with matching reset time, skipping ping notification');
                        return true;
                      }
                    }
                    return false;
                  });
                  
                  if (foundNotification) {
                    serviceLogger.info(`Found existing notification for current Aya bounties rotation, skipping ping notification`);
                    // Still update the message but don't send notifications/pings
                    await updateAllMessages(client, ayaTents, expiryTimestamp, true);
                    lastExpiryTimestamp = expiryTimestamp;
                    
                    // Schedule the next check and return early
                    const currentTime = Math.floor(Date.now() / 1000);
                    const timeToNextReset = (expiryTimestamp - currentTime) * 1000;
                    let nextCheckDelay = checkInterval;
                    
                    if (timeToNextReset > 0 && timeToNextReset < 5 * 60 * 1000) {
                      nextCheckDelay = timeToNextReset + 10000;
                    }
                    
                    setTimeout(() => checkAndUpdate(client), nextCheckDelay);
                    return;
                  }
                }
              }
            } catch (err) {
              serviceLogger.error('Error checking for existing Aya bounty messages:', err);
              // Continue with notification if check fails
            }
          }
        } catch (dbErr) {
          serviceLogger.error('Error accessing database for startup check:', dbErr);
          // Continue with notification if check fails
        }
      }
      
      await updateAllMessages(client, ayaTents, expiryTimestamp);
    }
    
    // Update the last expiry timestamp
    lastExpiryTimestamp = expiryTimestamp;
    
    // Calculate time until next reset
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToNextReset = (expiryTimestamp - currentTime) * 1000;
    
    // If the next reset is soon, check more frequently
    let nextCheckDelay = checkInterval;
    
    if (timeToNextReset > 0 && timeToNextReset < 5 * 60 * 1000) { // Less than 5 minutes
      // Check again right after the reset (10 seconds after)
      nextCheckDelay = timeToNextReset + 10000;
      serviceLogger.info(`Bounty reset in ${Math.floor(timeToNextReset / 60000)} minutes, scheduling next check in ${Math.floor(nextCheckDelay / 1000)} seconds`);
    }
    
    // Schedule the next check
    setTimeout(() => checkAndUpdate(client), nextCheckDelay);
    
  } catch (error) {
    serviceLogger.error('Error in Aya service check:', error);
    // Even if there's an error, continue checking
    setTimeout(() => checkAndUpdate(client), checkInterval);
  }
}

// Fetch Aya bounty data from the API
export async function fetchAyaBountyData(): Promise<AyaBountyData> {
  try {
    // Load dictionary for translations
    const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
    const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
    
    // Load bounty data for bounty names
    const bountiesPath = path.join(process.cwd(), 'dict', 'ExportBounties.json');
    const bountiesDict = JSON.parse(await fs.promises.readFile(bountiesPath, 'utf8')) as Record<string, BountyInfo>;
    
    // Fetch location bounties data
    serviceLogger.debug('Fetching location bounties from browse.wf');
    const locationBountiesResponse = await axios.get('https://oracle.browse.wf/location-bounties', {
      timeout: 10000,
      headers: {
        'User-Agent': 'WardenPrimeBot/1.0.0'
      }
    });
    
    const locationData = locationBountiesResponse.data;
    
    // Default expiry timestamp
    let expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // Default to 1 hour from now
    
    // Check if we have Cetus data
    if (!locationData.CetusSyndicate) {
      serviceLogger.warn('No Cetus bounty data found, returning empty data');
      return { 
        ayaTents: { TentA: [], TentB: [], TentC: [] },
        expiryTimestamp 
      };
    }
    
    // Try to get a more accurate expiry time from the world state
    try {
      // Fetch world state to get expiry time
      serviceLogger.debug('Fetching world state data from browse.wf');
      const worldStateResponse = await axios.get('https://oracle.browse.wf/worldState.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'WardenPrimeBot/1.0.0'
        }
      });
      
      // Find the Cetus syndicate mission to get rotation expiry
      const worldStateData = worldStateResponse.data;
      
      if (worldStateData?.SyndicateMissions) {
        const cetusMission = worldStateData.SyndicateMissions.find((mission: any) => 
          mission.Tag === "CetusSyndicate"
        );
        
        if (cetusMission?.Expiry?.$date?.$numberLong) {
          expiryTimestamp = parseInt(cetusMission.Expiry.$date.$numberLong) / 1000;
          serviceLogger.debug(`Found Cetus expiry timestamp: ${expiryTimestamp}`);
        }
      }
    } catch (worldStateError) {
      serviceLogger.warn('Error fetching world state for expiry time:', worldStateError);
      // Continue with default expiry
    }
    
    // Check which tents have Aya bounties
    const tents = ['TentA', 'TentB', 'TentC'];
    const tentResults: Record<string, Array<string>> = {
      TentA: [],
      TentB: [],
      TentC: []
    };
    
    for (const tent of tents) {
      const tentBounties = locationData.CetusSyndicate[tent] || [];
      const ayaInTent = tentBounties.filter((bounty: string) => AYA_BOUNTIES.includes(bounty));
      
      if (ayaInTent.length > 0) {
        tentResults[tent] = ayaInTent.map((bountyPath: string) => {
          const bountyInfo = bountiesDict[bountyPath];
          if (bountyInfo) {
            const translatedName = langDict[bountyInfo.name] || bountyInfo.name;
            return translatedName;
          }
          return bountyPath.split('/').pop() || bountyPath;
        });
      }
    }
    
    return {
      ayaTents: tentResults,
      expiryTimestamp
    };
    
  } catch (error) {
    serviceLogger.error('Error fetching Aya bounty data:', error);
    // Return empty data on error
    return { 
      ayaTents: { TentA: [], TentB: [], TentC: [] },
      expiryTimestamp: Math.floor(Date.now() / 1000) + 3600 // Default to 1 hour from now
    };
  }
}

// Update all configured channels with the latest bounty data
async function updateAllMessages(client: Client, ayaTents: Record<string, Array<string>>, expiryTimestamp: number, skipPings = false): Promise<void> {
  try {
    // Get all configured channels
    const ayaChannels = await pgdb.getAyaNotifications();
    
    if (ayaChannels.length === 0) {
      serviceLogger.info('No channels configured for Aya notifications');
      return;
    }
    
    serviceLogger.info(`Updating Aya bounty messages for ${ayaChannels.length} channels${skipPings ? ' (skipping pings)' : ''}`);
    
    // Create the embed for the update
    const ayaEmbed = createEmbed({
      type: 'info',
      title: 'Warframe Bounties',
      description: `Current Bounties\nReset <t:${Math.floor(expiryTimestamp)}:R>`,
      fields: [
        {
          name: 'Konzu Bounties:',
          value: '🔴 No good bounties available.',
          inline: false
        },
        {
          name: 'Tent A Bounties:',
          value: ayaTents.TentA && ayaTents.TentA.length > 0 ? 
            `🟢 Found Aya bounties:\n• ${ayaTents.TentA.join('\n• ')}` : 
            '🔴 No good bounties available.',
          inline: false
        },
        {
          name: 'Tent B Bounties:',
          value: ayaTents.TentB && ayaTents.TentB.length > 0 ? 
            `🟢 Found Aya bounties:\n• ${ayaTents.TentB.join('\n• ')}` : 
            '🔴 No good bounties available.',
          inline: false
        },
        {
          name: 'Tent C Bounties:',
          value: ayaTents.TentC && ayaTents.TentC.length > 0 ? 
            `🟢 Found Aya bounties:\n• ${ayaTents.TentC.join('\n• ')}` : 
            '🔴 No good bounties available.',
          inline: false
        }
      ],
      thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Currency/Aya.png',
      timestamp: true
    });
    
    // Check if we should add a role ping
    const anyAyaTentsFound = Object.values(ayaTents).some(tents => tents.length > 0);
    const twoOrMoreTentsFound = Object.values(ayaTents).filter(tents => tents.length > 0).length >= 2;
    
    // Update each channel's message
    for (const channelConfig of ayaChannels) {
      try {
        // Get the guild
        const guild = client.guilds.cache.get(channelConfig.guild_id);
        if (!guild) {
          serviceLogger.warn(`Guild ${channelConfig.guild_id} not found, skipping update`);
          continue;
        }
        
        // Get the channel
        const channel = await guild.channels.fetch(channelConfig.channel_id).catch((): null => null);
        if (!channel || !(channel instanceof TextChannel)) {
          serviceLogger.warn(`Channel ${channelConfig.channel_id} in guild ${channelConfig.guild_id} not found or not a text channel`);
          continue;
        }
        
        // Check if we have a message ID
        if (channelConfig.message_id) {
          try {
            // Try to fetch and update the existing message
            const message = await channel.messages.fetch(channelConfig.message_id);
            
            // Edit the message - but don't include role ping in edits since they don't trigger notifications
            await message.edit({ 
              content: null, // Remove any existing content/ping
              embeds: [ayaEmbed] 
            });
            
            // Send a separate ping message if Aya bounties were found and we're not skipping pings
            // This ensures users actually get a notification
            if (channelConfig.role_id && twoOrMoreTentsFound && !skipPings) {
              const pingMessage = await channel.send(`<@&${channelConfig.role_id}> Multiple Aya bounties found! Check the updated bounty list above.`);
              serviceLogger.info(`Sent ping message for role ${channelConfig.role_id} in channel ${channel.name}`);
              
              // Delete the ping message after 10 seconds to avoid cluttering the channel
              setTimeout(async () => {
                try {
                  await pingMessage.delete();
                  serviceLogger.info(`Deleted ping message in channel ${channel.name}`);
                } catch (deleteError) {
                  serviceLogger.warn(`Failed to delete ping message: ${deleteError}`);
                }
              }, 10000); // 10 seconds
            }
            
            serviceLogger.info(`Updated Aya bounty message in channel ${channel.name} (${channel.id}) with message ID ${message.id}`);
          } catch (messageError) {
            serviceLogger.warn(`Could not find existing message (${channelConfig.message_id}) in channel ${channel.name}, sending new message instead`);
            
            // Message doesn't exist anymore, send a new one
            // Prepare content
            let content = null;
            if (channelConfig.role_id && twoOrMoreTentsFound && !skipPings) {
              content = `<@&${channelConfig.role_id}> Multiple Aya bounties found!`;
            }
            
            // Send a new message
            const newMessage = await channel.send({ 
              content,
              embeds: [ayaEmbed] 
            });
            
            // Update the database with the new message ID
            await pgdb.updateAyaMessageId(channelConfig.id, newMessage.id);
            
            serviceLogger.info(`Sent new Aya bounty message to channel ${channel.name} (${channel.id}) with message ID ${newMessage.id}`);
          }
        } else {
          // No message ID, send a new message
          // Prepare content
          let content = null;
          if (channelConfig.role_id && twoOrMoreTentsFound && !skipPings) {
            content = `<@&${channelConfig.role_id}> Multiple Aya bounties found!`;
          }
          
          // Send a new message
          const newMessage = await channel.send({ 
            content,
            embeds: [ayaEmbed] 
          });
          
          // Update the database with the new message ID
          await pgdb.updateAyaMessageId(channelConfig.id, newMessage.id);
          
          serviceLogger.info(`Sent new Aya bounty message to channel ${channel.name} (${channel.id}) with message ID ${newMessage.id}`);
        }
      } catch (channelError) {
        serviceLogger.error(`Error updating Aya bounty message for channel ${channelConfig.channel_id}:`, channelError);
      }
    }
  } catch (error) {
    serviceLogger.error('Error updating all Aya bounty messages:', error);
  }
} 