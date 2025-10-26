import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { pgdb } from './postgresDatabase';
import axios from 'axios';
import { createEmbed } from '../utils/embedBuilder';

// Get environment variable for logging
const ENABLE_SERVICE_LOGS = process.env.ENABLE_INCARNON_SERVICE_LOGS === 'true';

// Custom logger that respects the service logging setting
const serviceLogger = {
  debug: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.debug(`[Incarnon] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.info(`[Incarnon] ${message}`, ...args);
    }
  },
  // Always log warnings and errors
  warn: (message: string, ...args: any[]) => {
    logger.warn(`[Incarnon] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    logger.error(`[Incarnon] ${message}`, ...args);
  }
};

// Rotation mappings for Steel Path Incarnon
const STEEL_PATH_ROTATIONS = [
  {
    rotation: 'A',
    weapons: ['Braton', 'Lato', 'Skana', 'Paris', 'Kunai']
  },
  {
    rotation: 'B',
    weapons: ['Boar', 'Gammacor', 'Angstrum', 'Gorgon', 'Anku']
  },
  {
    rotation: 'C',
    weapons: ['Bo', 'Latron', 'Furis', 'Furax', 'Strun']
  },
  {
    rotation: 'D',
    weapons: ['Lex', 'Magistar', 'Boltor', 'Bronco', 'Ceramic Dagger']
  },
  {
    rotation: 'E',
    weapons: ['Torid', 'Dual Toxocyst', 'Dual Ichor', 'Miter', 'Atomos']
  },
  {
    rotation: 'F',
    weapons: ['Ack & Brunt', 'Soma', 'Vasto', 'Nami Solo', 'Burston']
  },
  {
    rotation: 'G',
    weapons: ['Zylok', 'Sibear', 'Dread', 'Despair', 'Hate']
  },
  {
    rotation: 'H',
    weapons: ['Dera', 'Sybaris', 'Cestra', 'Sicarus', 'Okina']
  }
];

// Rotations reset on Monday at 00:00 UTC
function getNextMondayTimestamp(): number {
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setUTCHours(0, 0, 0, 0);
  
  // Get days until next Monday (0 is Sunday, 1 is Monday, etc)
  const daysUntilMonday = (1 + 7 - nextMonday.getUTCDay()) % 7;
  
  // If today is Monday and it's before reset, use today
  if (daysUntilMonday === 0 && now.getUTCHours() < 0) {
    return Math.floor(nextMonday.getTime() / 1000);
  }
  
  // Otherwise add days until next Monday
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  return Math.floor(nextMonday.getTime() / 1000);
}

// Helper to calculate days between now and a timestamp
function getDaysUntil(timestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((timestamp - now) / (60 * 60 * 24));
}

interface RewardCategory {
  Category: string;
  Choices: string[];
}

interface SteelPathReward {
  CurrentRotation: string;
  Weapon: string;
}

interface ApiResponse {
  EndlessXpChoices: RewardCategory[];
  SteelPathIncarnon?: SteelPathReward;
}

// Global state
let isServiceRunning = false;
let lastResetTimestamp = 0;
let checkInterval = 3600000; // Check every hour (3600000 ms)

// Create the incarnation embed
async function createIncarnationEmbed(): Promise<EmbedBuilder> {
  try {
    serviceLogger.info('Fetching Incarnon rotations from worldstate...');
    
    // Get worldstate data
    const response = await axios.get<ApiResponse>('https://oracle.browse.wf/worldState.json', {
      timeout: 10000,
      headers: {
      'User-Agent': 'WardenPrimeBot/1.0.0'
      }
    });
    
    // Process API data for regular incarnon rewards (frames)
    let normalRewards = 'None available';
    
    if (response?.data?.EndlessXpChoices) {
      const { EndlessXpChoices } = response.data;
      for (const category of EndlessXpChoices) {
        if (category.Category === 'EXC_NORMAL') {
          normalRewards = category.Choices.join(', ');
          break;
        }
      }
    }
    
    // Get Steel Path rotation from worldstate if available
    let currentRotationLetter = 'Unknown';
    let currentRotationWeapons: string[] = [];
    
    // If the API provides Steel Path rotation directly
    if (response?.data?.SteelPathIncarnon) {
      currentRotationLetter = response.data.SteelPathIncarnon.CurrentRotation;
      // Use the hardcoded rotation data to get all weapons for this rotation
      const rotationIndex = STEEL_PATH_ROTATIONS.findIndex(r => r.rotation === currentRotationLetter);
      if (rotationIndex !== -1) {
        currentRotationWeapons = STEEL_PATH_ROTATIONS[rotationIndex].weapons;
      } else {
        // Fallback if rotation letter doesn't match
        currentRotationWeapons = [response.data.SteelPathIncarnon.Weapon];
        serviceLogger.warn(`Unknown Steel Path rotation: ${currentRotationLetter}`);
      }
    } else {
      // If worldstate doesn't have the data, log warning
      serviceLogger.warn('SteelPathIncarnon not found in worldstate, using hardcoded data');
      
      // Fallback to date-based rotation if worldstate doesn't provide it
      // This is a temporary measure until worldstate includes this data
      const dateNow = new Date();
      const hardcodedStartDate = new Date('2024-03-03T00:00:00Z');
      const daysSinceStart = Math.floor((dateNow.getTime() - hardcodedStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const weeksSinceStart = Math.floor(daysSinceStart / 7);
      const rotationIndex = weeksSinceStart % STEEL_PATH_ROTATIONS.length;
      
      currentRotationLetter = STEEL_PATH_ROTATIONS[rotationIndex].rotation;
      currentRotationWeapons = STEEL_PATH_ROTATIONS[rotationIndex].weapons;
    }
    
    // Format the active weapons as a comma-separated list
    const activeWeapons = currentRotationWeapons.join(', ');
    
    // Calculate upcoming rotations
    const nextMondayTimestamp = getNextMondayTimestamp();
    const daysUntilNextRotation = getDaysUntil(nextMondayTimestamp);
    
    // Get index of current rotation
    const currentIndex = STEEL_PATH_ROTATIONS.findIndex(r => r.rotation === currentRotationLetter);
    if (currentIndex === -1) {
      serviceLogger.error(`Could not find rotation ${currentRotationLetter} in rotation data`);
    }
    
    // Calculate upcoming rotations
    const upcomingRotations = [];
    let nextTimestamp = nextMondayTimestamp;
    
    for (let i = 1; i < STEEL_PATH_ROTATIONS.length; i++) {
      const nextIndex = (currentIndex + i) % STEEL_PATH_ROTATIONS.length;
      const nextRotation = STEEL_PATH_ROTATIONS[nextIndex];
      
      upcomingRotations.push({
        rotation: nextRotation,
        timestamp: nextTimestamp
      });
      
      // Next rotation is 7 days later
      nextTimestamp += 7 * 24 * 60 * 60; // Add a week in seconds
    }
    
    // Build the upcoming weapons description with Discord timestamps
    let upcomingDescription = '';
    
    upcomingRotations.forEach((item) => {
      upcomingDescription += `<t:${item.timestamp}:R> ${item.rotation.weapons.join(', ')}\n`;
    });

    // Create the embed
    return createEmbed({
      type: 'info',
      title: `Circuit - Incarnons - Week ${currentRotationLetter}`,
      fields: [
        { 
          name: 'Normal Incarnon Rewards',
          value: normalRewards,
          inline: false 
        },
        { 
          name: 'Active',
          value: activeWeapons,
          inline: false 
        },
        {
          name: 'Rotates:',
          value: `<t:${nextMondayTimestamp}:F> (<t:${nextMondayTimestamp}:R>)`,
          inline: false
        },
        { 
          name: 'Upcoming',
          value: upcomingDescription,
          inline: false 
        }
      ],
      timestamp: false
    });

  } catch (error) {
    // Log the full error message for debugging
    serviceLogger.error('Error generating Incarnon rotations:', error);

    return createEmbed({
      type: 'error',
      title: 'Error',
      description: 'Failed to generate Incarnon rotations. Please try again later.',
      timestamp: true
    });
  }
}

// Initialize the Incarnon service
export function startIncarnationService(client: Client): void {
  if (isServiceRunning) {
    serviceLogger.debug('Incarnon service is already running');
    return;
  }
  
  serviceLogger.info('Starting Incarnon rotation notification service');
  isServiceRunning = true;
  
  // Start checking for updates
  checkAndUpdate(client);
}

// Manually trigger an Incarnon check (used for immediate notification after setup)
export function triggerIncarnationCheck(client: Client): void {
  serviceLogger.info('Manually triggering Incarnon check');
  
  // Check if client is ready
  if (!client.isReady()) {
    serviceLogger.warn('Client is not ready when triggerIncarnationCheck was called');
  }
  
  // Start the check process
  checkAndUpdate(client);
}

// Main function to check for updates and update messages
async function checkAndUpdate(client: Client): Promise<void> {
  try {
    // Calculate the next reset time (Monday at 00:00 UTC)
    const now = new Date();
    const currentTimestamp = Math.floor(now.getTime() / 1000);
    const nextMonday = new Date(now);
    nextMonday.setUTCHours(0, 0, 0, 0);
    
    // Get days until next Monday (0 is Sunday, 1 is Monday, etc)
    const daysUntilMonday = (1 + 7 - nextMonday.getUTCDay()) % 7;
    nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
    
    const nextResetTimestamp = Math.floor(nextMonday.getTime() / 1000);
    
    // Calculate time until next reset
    const timeToNextReset = (nextResetTimestamp - currentTimestamp) * 1000;
    
    // Check if rotation has just ended (within the last check interval)
    // Calculate previous reset timestamp
    const previousResetTimestamp = nextResetTimestamp - (7 * 24 * 60 * 60); // Subtract 7 days in seconds
    const didRotationJustEnd = 
      (currentTimestamp - previousResetTimestamp > 0) && // Current time is past the previous reset
      (currentTimestamp - previousResetTimestamp < checkInterval / 1000); // But only recently (within last check interval)
    
    // Log for debugging
    serviceLogger.debug(`Current timestamp: ${currentTimestamp}, Previous reset: ${previousResetTimestamp}`);
    serviceLogger.debug(`Next reset: ${nextResetTimestamp}, Time to next: ${timeToNextReset / 3600000} hours`);
    serviceLogger.debug(`Did rotation just end? ${didRotationJustEnd}`);
    
    // If the reset timestamp has changed since our last check,
    // it means we've had a rotation and need to update all messages
    if (lastResetTimestamp !== 0 && nextResetTimestamp !== lastResetTimestamp) {
      serviceLogger.info(`Rotation detected! Old reset: ${lastResetTimestamp}, New reset: ${nextResetTimestamp}`);
      await updateAllMessages(client, true);
    } else if (didRotationJustEnd) {
      // Rotation just ended, update messages with new data
      serviceLogger.info(`Rotation just ended! Updating all messages with new data`);
      await updateAllMessages(client, true);
    } else if (lastResetTimestamp === 0) {
      // First run after bot start, update all messages without pinging
      serviceLogger.info(`Initial Incarnon check, setting reset to ${nextResetTimestamp}`);
      await updateAllMessages(client, false);
    }
    
    // Update the last reset timestamp
    lastResetTimestamp = nextResetTimestamp;
    
    // If the next reset is soon, check more frequently
    let nextCheckDelay = checkInterval;
    
    if (timeToNextReset > 0 && timeToNextReset < 2 * 60 * 60 * 1000) { // Less than 2 hours
      // Check again right after the reset (30 seconds after)
      nextCheckDelay = timeToNextReset + 30000;
      serviceLogger.info(`Rotation reset in ${Math.floor(timeToNextReset / 3600000)} hours, scheduling next check in ${Math.floor(nextCheckDelay / 60000)} minutes`);
    } else if (timeToNextReset <= 0 && timeToNextReset > -checkInterval) {
      // We're right at or just past the reset time
      // Do an immediate check right now, then another one shortly after
      nextCheckDelay = 60000; // Check again in 1 minute
      serviceLogger.info(`Reset time has just passed, checking immediately and scheduling next check in 1 minute`);
      // Update messages immediately
      await updateAllMessages(client, true);
    }
    
    // Schedule the next check
    setTimeout(() => checkAndUpdate(client), nextCheckDelay);
    
  } catch (error) {
    serviceLogger.error('Error in Incarnon service check:', error);
    // Even if there's an error, continue checking
    setTimeout(() => checkAndUpdate(client), checkInterval);
  }
}

// Update all configured channels with the latest Incarnon data
async function updateAllMessages(client: Client, pingRole: boolean): Promise<void> {
  try {
    // Get all configured channels
    const notifications = await pgdb.getIncarnonNotifications();
    
    if (notifications.length === 0) {
      serviceLogger.info('No channels configured for Incarnon notifications');
      return;
    }
    
    serviceLogger.info(`Updating Incarnon messages for ${notifications.length} channels`);
    
    // Create the embed for the update
    const embed = await createIncarnationEmbed();
    
    // Update each channel's message
    for (const config of notifications) {
      try {
        // Get the guild
        const guild = client.guilds.cache.get(config.guild_id);
        if (!guild) {
          serviceLogger.warn(`Guild ${config.guild_id} not found, skipping update`);
          continue;
        }
        
        // Get the channel
        const channel = await guild.channels.fetch(config.channel_id).catch((): null => null);
        if (!channel || !(channel instanceof TextChannel)) {
          serviceLogger.warn(`Channel ${config.channel_id} in guild ${config.guild_id} not found or not a text channel`);
          continue;
        }
        
        // Prepare content - only ping role if this is an actual rotation change and pinging is enabled
        let content = null;
        if (pingRole && config.role_id) {
          content = `<@&${config.role_id}> Incarnon rotation has changed!`;
        }
        
        // Check if we have a message ID
        if (config.message_id) {
          try {
            // Try to fetch and update the existing message
            const message = await channel.messages.fetch(config.message_id);
            
            // Edit the message without the ping (since edits with pings don't notify users)
            await message.edit({ 
              content: null, // Remove any existing content/ping
              embeds: [embed] 
            });
            
            // If this is an actual rotation change and pinging is enabled, send a separate ping message
            if (pingRole && config.role_id) {
              const pingMessage = await channel.send(`<@&${config.role_id}> Incarnon rotation has changed! Check the updated rotations above.`);
              logger.info(`Sent ping message for role ${config.role_id} in channel ${channel.name}`);
              
              // Delete the ping message after 10 seconds to avoid cluttering the channel
              setTimeout(async () => {
                try {
                  await pingMessage.delete();
                  serviceLogger.debug(`Deleted ping message in channel ${channel.name}`);
                } catch (deleteError) {
                  serviceLogger.warn(`Failed to delete ping message: ${deleteError}`);
                }
              }, 10000); // 10 seconds
            }
            
            serviceLogger.info(`Updated Incarnon message in channel ${channel.name} (${channel.id}) with message ID ${message.id}`);
          } catch (messageError) {
            serviceLogger.warn(`Could not find existing message (${config.message_id}) in channel ${channel.name}, sending new message instead`);
            
            // Message doesn't exist anymore, send a new one
            const newMessage = await channel.send({ 
              content, 
              embeds: [embed] 
            });
            
            // Update the database with the new message ID
            await pgdb.updateIncarnonMessageId(config.id, newMessage.id);
            
            serviceLogger.info(`Sent new Incarnon message to channel ${channel.name} (${channel.id}) with message ID ${newMessage.id}`);
          }
        } else {
          // No message ID, send a new message
          const newMessage = await channel.send({ 
            content, 
            embeds: [embed] 
          });
          
          // Update the database with the new message ID
          await pgdb.updateIncarnonMessageId(config.id, newMessage.id);
          
          serviceLogger.info(`Sent new Incarnon message to channel ${channel.name} (${channel.id}) with message ID ${newMessage.id}`);
        }
      } catch (channelError) {
        serviceLogger.error(`Error updating Incarnon message for channel ${config.channel_id}:`, channelError);
      }
    }
  } catch (error) {
    serviceLogger.error('Error updating all Incarnon messages:', error);
  }
} 