import { Client, TextChannel, Message } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { pgdb } from './postgresDatabase';
import { createEmbed } from '../utils/embedBuilder';

// Get environment variable for logging
const ENABLE_SERVICE_LOGS = process.env.ENABLE_BARO_SERVICE_LOGS === 'true';

// Custom logger that respects the service logging setting
const serviceLogger = {
  debug: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.debug(`[Baro] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (ENABLE_SERVICE_LOGS) {
      logger.info(`[Baro] ${message}`, ...args);
    }
  },
  // Always log warnings and errors
  warn: (message: string, ...args: any[]) => {
    logger.warn(`[Baro] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    logger.error(`[Baro] ${message}`, ...args);
  }
};

// Interfaces
interface BaroNotification {
  id: string;
  guild_id: string;
  channel_id: string;
  role_id: string | null;
  message_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RegionData {
  name: string;
  systemName: string;
  missionName: string;
  factionName: string;
}

interface DictionaryItem {
  name?: string;
  translatedName?: string;
  era?: string;
  category?: string;
}

interface VoidTrader {
  _id: { $oid: string };
  Activation: { $date: { $numberLong: string } };
  Expiry: { $date: { $numberLong: string } };
  Character: string;
  Node: string;
  Manifest?: Array<{
    ItemType: string;
    PrimePrice: number;
    RegularPrice: number;
  }>;
}

interface BaroData {
  voidTrader: VoidTrader;
  isActive: boolean;
  location: {
    planet: string;
    relay: string;
  };
  arrival: string;
  departure: string;
  inventory: Array<{
    name: string;
    ducats: number;
    credits: number;
  }>;
}

// Global state
let isServiceRunning = false;
let lastBaroId = '';
let lastBaroActivation = 0;
let lastBaroExpiry = 0;
let checkInterval = 300000; // Check every 5 minutes (Baro doesn't change often)

// Cache for dictionaries
let regionsDict: Record<string, RegionData> | null = null;
let langDict: Record<string, string> | null = null;

// Initialize the Baro service
export function startBaroService(client: Client): void {
  if (isServiceRunning) {
    serviceLogger.debug('Baro service is already running');
    return;
  }
  
  serviceLogger.info('Starting Baro Ki\'Teer notification service');
  isServiceRunning = true;
  
  // Start checking for updates
  checkAndUpdate(client);
}

// Manually trigger a Baro update for a specific guild
export async function triggerBaroUpdate(client: Client, guildId: string): Promise<Message | null> {
  serviceLogger.info(`Manually triggering Baro Ki'Teer update for guild ${guildId}`);
  
  try {
    // Get the guild's configuration from PostgreSQL
    const configs = await pgdb.getBaroNotifications();
    const config = configs.find(c => c.guild_id === guildId);
    
    if (!config) {
      serviceLogger.warn(`No Baro configuration found for guild ${guildId}`);
      return null;
    }
    
    // Get the guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      serviceLogger.warn(`Guild ${guildId} not found`);
      return null;
    }
    
    // Get the channel
    const channel = await guild.channels.fetch(config.channel_id).catch((): null => null);
    if (!channel || !(channel instanceof TextChannel)) {
      serviceLogger.warn(`Channel ${config.channel_id} in guild ${guildId} not found or not a text channel`);
      return null;
    }
    
    // Get Baro data
    const baroData = await fetchBaroData();
    if (!baroData) {
      serviceLogger.error('Failed to fetch Baro data for manual update');
      return null;
    }
    
    // Create the embed
    const { embed, shouldPing } = createBaroEmbed(baroData);
    
    // Prepare content (for role pings)
    let content: string | undefined = undefined;
    if (shouldPing && config.role_id) {
      content = `<@&${config.role_id}> Baro Ki'Teer has arrived with new inventory!`;
    }
    
    // Try to update existing message if we have its ID
    if (config.message_id) {
      try {
        const existingMessage = await channel.messages.fetch(config.message_id);
        await existingMessage.edit({ 
          content: null, // Remove content/ping from edit
          embeds: [embed] 
        });
        
        // Send separate ping if needed
        if (shouldPing && config.role_id) {
          const pingMessage = await channel.send(`<@&${config.role_id}> Baro Ki'Teer has arrived with new inventory! Check the updated list above.`);
          serviceLogger.info(`Sent ping message for role ${config.role_id} in channel ${channel.name}`);
          
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
        
        serviceLogger.info(`Updated existing Baro message in channel ${channel.name} (${channel.id})`);
        return existingMessage;
      } catch (error) {
        serviceLogger.warn(`Could not find/update existing Baro message (${config.message_id}), sending new one`);
        // Continue to send a new message
      }
    }
    
    // Send a new message
    const sentMessage = await channel.send({ content, embeds: [embed] });
    serviceLogger.info(`Sent new Baro message to channel ${channel.name} (${channel.id}) with ID ${sentMessage.id}`);
    
    // Update the database with the new message ID
    await pgdb.updateBaroMessageId(config.id, sentMessage.id);
    
    return sentMessage;
  } catch (error) {
    serviceLogger.error('Error triggering Baro update:', error);
    return null;
  }
}

// Main function to check for updates and send notifications
async function checkAndUpdate(client: Client): Promise<void> {
  try {
    serviceLogger.debug('Checking for Baro Ki\'Teer updates');
    
    // Fetch Baro data
    const baroData = await fetchBaroData();
    if (!baroData) {
      serviceLogger.error('Failed to fetch Baro data');
      scheduleNextCheck(client);
      return;
    }
    
    // Check if Baro data has changed significantly
    const baroId = baroData.voidTrader._id.$oid;
    const activation = parseInt(baroData.voidTrader.Activation.$date.$numberLong);
    const expiry = parseInt(baroData.voidTrader.Expiry.$date.$numberLong);
    
    const isNewCycle = baroId !== lastBaroId;
    const baroStatusChanged = 
      (lastBaroActivation === 0 || activation !== lastBaroActivation) || 
      (lastBaroExpiry === 0 || expiry !== lastBaroExpiry);
    
    if (!isNewCycle && !baroStatusChanged) {
      serviceLogger.debug('No significant changes to Baro data, skipping update');
      scheduleNextCheck(client);
      return;
    }
    
    // Update our tracked state
    lastBaroId = baroId;
    lastBaroActivation = activation;
    lastBaroExpiry = expiry;
    
    // Get all configured channels from PostgreSQL
    const baroChannels = await pgdb.getBaroNotifications();
    
    if (baroChannels.length === 0) {
      serviceLogger.debug('No channels configured for Baro notifications');
      scheduleNextCheck(client);
      return;
    }
    
    serviceLogger.info(`Updating Baro messages for ${baroChannels.length} channels`);
    
    // Create the embed
    const { embed, shouldPing } = createBaroEmbed(baroData);
    
    // Update each channel
    for (const channelConfig of baroChannels) {
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
        
        // Prepare content (for role pings)
        let content: string | undefined = undefined;
        if (shouldPing && channelConfig.role_id) {
          content = `<@&${channelConfig.role_id}> Baro Ki'Teer has arrived with new inventory!`;
        }
        
        // Try to update existing message if we have its ID
        if (channelConfig.message_id) {
          try {
            const existingMessage = await channel.messages.fetch(channelConfig.message_id);
            await existingMessage.edit({ 
              content: null, // Remove any existing content/ping
              embeds: [embed] 
            });
            
            // If should ping, send a separate message with the ping and then delete it after a delay
            if (shouldPing && channelConfig.role_id) {
              const pingMessage = await channel.send(`<@&${channelConfig.role_id}> Baro Ki'Teer has arrived with new inventory! Check the updated list above.`);
              serviceLogger.info(`Sent ping message for role ${channelConfig.role_id} in channel ${channel.name}`);
              
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
            
            serviceLogger.info(`Updated existing Baro message in channel ${channel.name} (${channel.id})`);
            continue; // Skip to next channel
          } catch (error) {
            serviceLogger.warn(`Could not find/update existing Baro message (${channelConfig.message_id}), sending new one`);
            // Continue to send a new message
          }
        }
        
        // Send a new message
        const sentMessage = await channel.send({ content, embeds: [embed] });
        serviceLogger.info(`Sent new Baro message to channel ${channel.name} (${channel.id}) with ID ${sentMessage.id}`);
        
        // Update the database with the new message ID
        await pgdb.updateBaroMessageId(channelConfig.id, sentMessage.id);
        
      } catch (channelError) {
        serviceLogger.error(`Error updating Baro message for guild ${channelConfig.guild_id}:`, channelError);
      }
    }
    
    // Schedule the next check
    scheduleNextCheck(client);
    
  } catch (error) {
    serviceLogger.error('Error in Baro service check:', error);
    // Even if there's an error, continue checking
    scheduleNextCheck(client);
  }
}

// Schedule the next check
function scheduleNextCheck(client: Client): void {
  setTimeout(() => checkAndUpdate(client), checkInterval);
}

// Fetch Baro data from the API
async function fetchBaroData(): Promise<BaroData | null> {
  try {
    // Initialize dictionaries if needed
    await loadDictionaries();
    
    // Fetch the world state data
    serviceLogger.info('Fetching Baro data from worldState API');
    const response = await axios.get('https://oracle.browse.wf/worldState.json', {
      timeout: 10000, // 10s timeout
      headers: {
        'User-Agent': 'KorptairBot/1.0.0' // Custom user agent
      }
    });
    
    const worldState = response.data;
    
    // Find Baro's data
    const voidTraders = worldState.VoidTraders || [];
    serviceLogger.info(`Found ${voidTraders.length} void traders in worldState`);
    
    if (voidTraders.length === 0) {
      serviceLogger.warn('No Void Traders found in world state');
      return null;
    }
    
    // Get the first trader (usually Baro)
    const baro = voidTraders[0];
    
    // Get arrival and departure dates
    let departureTime = 'Unknown';
    let arrivalTime = 'Unknown';
    let isActive = false;
    const currentTime = Date.now();
    
    try {
      // Check for activation time
      if (baro.Activation && baro.Activation.$date && baro.Activation.$date.$numberLong) {
        const arrivalMs = parseInt(baro.Activation.$date.$numberLong);
        if (!isNaN(arrivalMs)) {
          const arrivalDate = new Date(arrivalMs);
          arrivalTime = `<t:${Math.floor(arrivalDate.getTime() / 1000)}:R>`;
          
          // Determine if Baro is currently active or not yet arrived
          isActive = currentTime >= arrivalMs;
        }
      }
      
      // Get expiry time
      if (baro.Expiry && baro.Expiry.$date && baro.Expiry.$date.$numberLong) {
        const departureMs = parseInt(baro.Expiry.$date.$numberLong);
        if (!isNaN(departureMs)) {
          const departureDate = new Date(departureMs);
          departureTime = `<t:${Math.floor(departureDate.getTime() / 1000)}:R>`;
        }
      }
    } catch (dateError) {
      serviceLogger.error('Error formatting dates:', dateError);
    }
    
    // Translate the location
    const nodeName = baro.Node || 'Unknown';
    const location = await translateLocation(nodeName);
    
    // Only process inventory if Baro is active
    const inventory = isActive ? processInventory(baro.Manifest || []) : [];
    
    return {
      voidTrader: baro,
      isActive,
      location,
      arrival: arrivalTime,
      departure: departureTime,
      inventory
    };
    
  } catch (error) {
    serviceLogger.error('Error fetching Baro data:', error);
    return null;
  }
}

// Process Baro's inventory items
function processInventory(manifest: Array<any>): Array<{name: string, ducats: number, credits: number}> {
  // Use a Map to track items with same name to avoid duplicates
  const uniqueItems = new Map();
  let skippedItems = 0;
  
  // Process items for new formatted output
  for (const item of manifest) {
    const itemType = item.ItemType;
    
    try {
      // Get item name using dictionary lookup
      const itemName = getBaroItemName(itemType);
      
      // Only add items that have a translation
      if (itemName) {
        if (!uniqueItems.has(itemName)) {
          uniqueItems.set(itemName, {
            name: itemName,
            ducats: item.PrimePrice,
            credits: item.RegularPrice
          });
        }
      } else {
        // Count and log items that were skipped due to missing translations
        skippedItems++;
        serviceLogger.warn(`Skipped Baro item with no translation: ${itemType}`);
      }
    } catch (itemError) {
      // Log errors but don't add to the inventory
      serviceLogger.error(`Error processing Baro item ${itemType}:`, itemError);
      skippedItems++;
    }
  }
  
  // Convert to array and sort by ducats (high to low)
  const inventoryItems = Array.from(uniqueItems.values());
  inventoryItems.sort((a, b) => b.ducats - a.ducats);
  
  serviceLogger.info(`Baro items processed: ${inventoryItems.length} total, ${skippedItems} skipped`);
  
  return inventoryItems;
}

// Create the Baro embed
function createBaroEmbed(baroData: BaroData): { embed: any, shouldPing: boolean } {
  // Create description based on whether Baro is active or not
  let description;
  const shouldPing = baroData.isActive && baroData.inventory.length > 0;
  
  if (baroData.isActive) {
    description = `Leaves ${baroData.location.relay} (${baroData.location.planet}) ${baroData.departure}`;
  } else {
    description = `Arriving at ${baroData.location.planet} (${baroData.location.relay}) ${baroData.arrival}`;
  }
  
  // If Baro is not active or has no inventory, return a simple embed
  if (!baroData.isActive || baroData.inventory.length === 0) {
    return {
      embed: createEmbed({
        type: 'info',
        title: 'Baro Ki\'Teer',
        description,
        timestamp: true
      }),
      shouldPing: false
    };
  }
  
  // Calculate how many items we can fit in one embed
  // Discord has a limit of 1024 characters per field value
  // Let's build the columns for all items
  let itemColumn = '';
  let ducatsColumn = '';
  let creditColumn = '';
  
  // Format all items for the three columns
  // Discord field max length is 1024 chars, so we need to be careful
  let totalItemsAdded = 0;
  
  for (const item of baroData.inventory) {
    // Add new line and item data
    const newItemLine = `${item.name}\n`;
    const newDucatsLine = `${item.ducats}\n`;
    const newCreditsLine = `${item.credits.toLocaleString()}\n`;
    
    // Check if adding this would exceed Discord's field limit (1024 chars)
    if (itemColumn.length + newItemLine.length < 1024 && 
        ducatsColumn.length + newDucatsLine.length < 1024 && 
        creditColumn.length + newCreditsLine.length < 1024) {
      
      itemColumn += newItemLine;
      ducatsColumn += newDucatsLine;
      creditColumn += newCreditsLine;
      totalItemsAdded++;
    } else {
      // We've reached the Discord limit - stop adding items
      serviceLogger.warn(`Reached Discord field limit after ${totalItemsAdded} items. Some items will not be displayed.`);
      break;
    }
  }
  
  // Return the embed
  return {
    embed: createEmbed({
      type: 'info',
      title: 'Baro Ki\'Teer',
      description,
      fields: [
        { 
          name: 'Item', 
          value: itemColumn || 'No items', 
          inline: true 
        },
        { 
          name: '<:OrokinDucats:1353350538921644053> Ducats', 
          value: ducatsColumn || '0', 
          inline: true 
        },
        { 
          name: '<:Credits:1353350526086942801> Credits', 
          value: creditColumn || '0', 
          inline: true 
        }
      ],
      footer: totalItemsAdded < baroData.inventory.length ? 
        `Showing ${totalItemsAdded} of ${baroData.inventory.length} items (Discord limit reached)` : 
        `Last updated: ${new Date().toLocaleString()}`,
      timestamp: true
    }),
    shouldPing: shouldPing
  };
}

// Load dictionaries
async function loadDictionaries(): Promise<void> {
  try {
    // Only load if not already loaded
    if (!regionsDict) {
      const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
      const data = await fs.promises.readFile(regionsPath, 'utf8');
      regionsDict = JSON.parse(data);
      serviceLogger.debug(`Loaded regions dictionary with ${Object.keys(regionsDict).length} entries`);
    }
    
    if (!langDict) {
      const langPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      const langData = await fs.promises.readFile(langPath, 'utf8');
      langDict = JSON.parse(langData);
      serviceLogger.debug(`Loaded language dictionary with ${Object.keys(langDict).length} entries`);
    }
  } catch (error) {
    serviceLogger.error('Error loading dictionaries:', error);
    throw error;
  }
}

// Translate location
async function translateLocation(nodeName: string): Promise<{ planet: string, relay: string }> {
  try {
    // Ensure dictionaries are loaded
    if (!regionsDict) {
      await loadDictionaries();
    }
    
    const regionData = regionsDict![nodeName];
    
    if (!regionData) {
      return { planet: 'Unknown', relay: nodeName };
    }
    
    // Get the full paths
    const planetPath = regionData.systemName || '';
    const relayPath = regionData.name || '';
    
    // Try to find the translations directly in the Lang dictionary
    const planetTranslation = langDict ? langDict[planetPath] : null;
    const relayTranslation = langDict ? langDict[relayPath] : null;
    
    // Use the translations if found, otherwise fall back to path parsing
    const planet = planetTranslation || planetPath.split('/').pop() || 'Unknown';
    const relay = relayTranslation || relayPath.split('/').pop() || 'Unknown';
    
    return { planet, relay };
  } catch (error) {
    serviceLogger.error('Error translating location:', error);
    return { planet: 'Unknown', relay: nodeName };
  }
}

// Get item name
function getBaroItemName(itemPath: string): string | null {
  // Clean the path by removing /StoreItems
  const cleanPath = itemPath.replace('/StoreItems', '');
  
  // Special cases based on path patterns
  if (cleanPath.includes('/Weapons/Corpus/LongGun/CorpusAssaultRifle')) {
    return 'Quanta Vandal';
  }
  if (cleanPath.includes('/Weapons/Corpus/LongGun/CorpusShockRifleDualAmmo')) {
    return 'Supra Vandal';
  }
  if (cleanPath.includes('/Weapons/Grineer/LongGun/GrineerLightRifleWraith')) {
    return 'Karak Wraith';
  }
  if (cleanPath.includes('/Weapons/Tenno/Thrown/PrismaSkana')) {
    return 'Prisma Skana';
  }
  
  // Common part names without having to do full dictionary lookups
  if (cleanPath.includes('PrismaGorgon')) return 'Prisma Gorgon';
  if (cleanPath.includes('PrismaGrakata')) return 'Prisma Grakata';
  if (cleanPath.includes('PrismaTetra')) return 'Prisma Tetra';
  if (cleanPath.includes('PrismaVeritux')) return 'Prisma Veritux';
  if (cleanPath.includes('MacheteWraith')) return 'Machete Wraith';
  if (cleanPath.includes('PrismaDualCleavers')) return 'Prisma Dual Cleavers';
  if (cleanPath.includes('PrismaJetKittagWithPolearm')) return 'Prisma Jet Kitag';
  if (cleanPath.includes('PrismaObex')) return 'Prisma Obex';

  // Cosmetic items
  if (cleanPath.includes('Armor/BaroArmor')) return 'Ki\'Teer Armor';
  if (cleanPath.includes('Syandana/BaroSyandana')) return 'Ki\'Teer Syandana';
  if (cleanPath.includes('/Sigils/BaroKiTeer')) return 'Ki\'Teer Sekhara';
  if (cleanPath.includes('/Chest/BaroBody')) return 'Ki\'Teer Chest Plate';
  if (cleanPath.includes('/Ephemera/BaroKiTeer')) return 'Ki\'Teer Ephemera';
  
  // Mods are harder to translate without full dictionaries
  // For now, extract the last part of the path as a fallback
  if (cleanPath.includes('/Mods/')) {
    const parts = cleanPath.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.replace(/([A-Z])/g, ' $1').trim();
  }
  
  // Use a basic fallback for other items
  const parts = cleanPath.split('/');
  const lastPart = parts[parts.length - 1];
  return lastPart.replace(/([A-Z])/g, ' $1').trim();
} 