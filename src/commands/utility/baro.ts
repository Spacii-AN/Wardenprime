import { 
  SlashCommandBuilder, 
  ChannelType, 
  TextChannel, 
  ChatInputCommandInteraction
} from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import axios from 'axios';
import { initializeDictionaries, findItemInDicts } from '../../utils/dictionaryLoader';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// Define types for dictionary results
interface DictionaryItem {
  name?: string;
  translatedName?: string;
  era?: string;
  category?: string;
}

interface RegionData {
  name: string;
  systemName: string;
  [key: string]: any;
}

// Cache for the regions dictionary
let regionsDict: Record<string, RegionData> | null = null;

/**
 * Load the regions dictionary for location translation
 */
async function loadRegionsDict(): Promise<Record<string, RegionData>> {
  if (regionsDict) return regionsDict;
  
  try {
    const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
    const data = await fs.promises.readFile(regionsPath, 'utf8');
    regionsDict = JSON.parse(data);
    return regionsDict;
  } catch (error) {
    logger.error('Error loading regions dictionary:', error);
    return {};
  }
}

/**
 * Translate a node name (like "MercuryHUB") to planet and relay names
 */
async function translateLocation(nodeName: string): Promise<{ planet: string, relay: string }> {
  try {
    const regions = await loadRegionsDict();
    const regionData = regions[nodeName];
    
    if (!regionData) {
      return { planet: 'Unknown', relay: nodeName };
    }
    
    // Get the full paths
    const planetPath = regionData.systemName || '';
    const relayPath = regionData.name || '';
    
    // Log the full paths for debugging
    logger.debug(`Planet path: ${planetPath}, Relay path: ${relayPath}`);
    
    // Load the Lang dictionary directly from the file
    let langDict: Record<string, string> = {};
    try {
      const langPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      const langData = await fs.promises.readFile(langPath, 'utf8');
      langDict = JSON.parse(langData);
      logger.debug(`Language dictionary loaded with ${Object.keys(langDict).length} entries`);
    } catch (dictError) {
      logger.error('Error loading language dictionary:', dictError);
    }
    
    // Try to find the translations directly in the Lang dictionary
    const planetTranslation = langDict[planetPath];
    const relayTranslation = langDict[relayPath];
    
    logger.debug(`Found in Lang dict - Planet: ${planetTranslation || 'Not found'}, Relay: ${relayTranslation || 'Not found'}`);
    
    // Use the translations if found, otherwise fall back to path parsing
    const planet = planetTranslation || planetPath.split('/').pop() || 'Unknown';
    const relay = relayTranslation || relayPath.split('/').pop() || 'Unknown';
    
    return { planet, relay };
  } catch (error) {
    logger.error('Error translating location:', error);
    return { planet: 'Unknown', relay: nodeName };
  }
}

/**
 * Get item category icon based on item type
 */
function getItemIcon(itemType: string): string {
  // No longer returning any emojis for item types
  return '';
}

/**
 * Get a proper name for Baro Ki'Teer item
 * Uses dictionary lookups
 */
function getBaroItemName(itemPath: string): string | null {
  // More detailed logging for debugging
  logger.debug(`Looking up item: ${itemPath}`);
  
  // Check if this is likely a relic
  if (itemPath.includes('/Projections/')) {
    logger.debug(`Item appears to be a relic: ${itemPath}`);
  }
  
  // Clean the path by removing /StoreItems
  const cleanPath = itemPath.replace('/StoreItems', '');
  // Log both paths for comparison
  logger.debug(`Cleaned path: ${cleanPath}`);
  
  // Try the dictionary lookup with the cleaned path
  const itemDetails = findItemInDicts(cleanPath) as DictionaryItem;
  if (itemDetails) {
    logger.debug(`Found item details: ${JSON.stringify(itemDetails)}`);
    
    // Special case for relics - combine era and category
    if (cleanPath.includes('/Projections/') && itemDetails.era && itemDetails.category) {
      const relicName = `${itemDetails.era} ${itemDetails.category}`;
      logger.debug(`Found relic: ${relicName} (era: ${itemDetails.era}, category: ${itemDetails.category})`);
      return relicName;
    }
    
    // Regular case - use translated name
    if (itemDetails.translatedName) {
      logger.debug(`Using translated name: ${itemDetails.translatedName}`);
      return itemDetails.translatedName;
    }
  } else {
    logger.debug(`No item details found for: ${cleanPath}`);
  }
  
  // No fallback - return null if not found
  logger.debug(`No translation found for item: ${cleanPath}`);
  return null;
}

// Command to fetch and display Baro Ki'Teer's inventory
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('baro')
    .setDescription('Displays Baro Ki\'Teer\'s current inventory')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel to send the Baro inventory to')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ) as SlashCommandBuilder,
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      // Initialize dictionaries if not already done
      await initializeDictionaries();
      
      // Fetch the world state data
      logger.info(`Fetching Baro's inventory from worldState API`);
      const response = await axios.get('https://oracle.browse.wf/worldState.json', {
        timeout: 10000, // 10s timeout
        headers: {
          'User-Agent': 'KorptairBot/1.0.0' // Custom user agent
        }
      });
      const worldState = response.data;
      
      // Find Baro's inventory
      const voidTraders = worldState.VoidTraders || [];
      logger.info(`Found ${voidTraders.length} void traders in worldState`);
      
      if (voidTraders.length === 0) {
        const noBaroEmbed = createEmbed({
          type: 'info',
          title: 'Baro Ki\'Teer',
          description: 'Baro Ki\'Teer is not currently available.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [noBaroEmbed] });
        return;
      }
      
      // Get the first trader's inventory (usually Baro)
      const baro = voidTraders[0];
      logger.info(`Processing inventory for trader: ${baro.Character || 'Unknown'} at ${baro.Node || 'Unknown'}`);
      
      // Log Baro's details to help debug date issues
      logger.debug(`Baro details: ${JSON.stringify(baro, null, 2)}`);
      
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
        logger.error('Error formatting dates:', dateError);
      }

      // Translate the location
      const nodeName = baro.Node || 'Unknown';
      const { planet, relay } = await translateLocation(nodeName);
      
      // Create description based on whether Baro is active or not
      let description;
      if (isActive) {
        description = `Leaves ${relay} (${planet}) ${departureTime}`;
      } else {
        description = `Trader will be showing up at ${planet} (${relay}) ${arrivalTime}`;
      }
      
      // Only process inventory if Baro is active
      if (!isActive) {
        const upcomingEmbed = createEmbed({
          type: 'info',
          title: 'Baro Ki\'Teer',
          description: description,
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [upcomingEmbed] });
        return;
      }
      
      // Only check inventory if Baro is active (moved from earlier)
      // Create a formatted list of items
      const inventory = baro.Manifest || [];
      logger.info(`Found ${inventory.length} items in Baro's inventory`);
      
      if (inventory.length === 0) {
        const emptyInventoryEmbed = createEmbed({
          type: 'info',
          title: 'Baro Ki\'Teer',
          description: 'Baro Ki\'Teer has no items in his inventory.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [emptyInventoryEmbed] });
        return;
      }
      
      // Log the first few items to see what they look like
      logger.debug('Sample items from inventory:');
      inventory.slice(0, 3).forEach((item: any, index: number) => {
        logger.debug(`Item ${index + 1}: ${JSON.stringify(item)}`);
      });
      
      // Create a loading embed
      const loadingEmbed = createEmbed({
        type: 'info',
        title: 'Baro Ki\'Teer',
        description: `Processing inventory items...`,
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [loadingEmbed] });
      
      // Process the inventory items
      logger.info(`Starting to process ${inventory.length} items...`);

      // Use a Map to track items with same name to avoid duplicates
      const uniqueItems = new Map();
      let skippedItems = 0;

      // Process items for new formatted output
      for (const item of inventory) {
        const itemType = item.ItemType;
        
        try {
          // Get item name using our optimized function (fast lookup)
          const itemName = getBaroItemName(itemType);
          
          // Only add items that have a translation
          if (itemName) {
            if (!uniqueItems.has(itemName)) {
              uniqueItems.set(itemName, {
                name: itemName,
                type: itemType,
                ducats: item.PrimePrice,
                credits: item.RegularPrice
              });
            }
          } else {
            // Count and log items that were skipped due to missing translations
            skippedItems++;
            logger.warn(`Skipped item with no translation: ${itemType}`);
          }
        } catch (itemError) {
          // Log errors but don't add to the inventory
          logger.error(`Error processing item ${itemType}:`, itemError);
          skippedItems++;
        }
      }

      // Convert to array and sort by ducats (high to low)
      const inventoryItems = Array.from(uniqueItems.values());
      inventoryItems.sort((a, b) => b.ducats - a.ducats);

      logger.info(`Items processed: ${inventoryItems.length} total, ${skippedItems} skipped`);

      // If no valid items remain, inform the user
      if (inventoryItems.length === 0) {
        const noItemsEmbed = createEmbed({
          type: 'info',
          title: 'Baro Ki\'Teer',
          description: 'No valid items could be found in Baro\'s inventory. This could be due to missing translations.',
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [noItemsEmbed] });
        return;
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
      
      for (const item of inventoryItems) {
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
          logger.warn(`Reached Discord field limit after ${totalItemsAdded} items. Some items will not be displayed.`);
          break;
        }
      }
      
      // Log how many items we're displaying
      logger.info(`Displaying ${totalItemsAdded} out of ${inventoryItems.length} items in a single embed`);
      
      // Create a single embed with all inventory
      const baroEmbed = createEmbed({
        type: 'info',
        title: 'Baro Ki\'Teer',
        description: description,
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
        footer: totalItemsAdded < inventoryItems.length ? 
          `Showing ${totalItemsAdded} of ${inventoryItems.length} items (Discord limit reached)` : `Today at ${new Date().toLocaleTimeString()}`,
        timestamp: true
      });
      
      // Check if a specific channel was provided
      const targetChannel = interaction.options.getChannel('channel');
      
      if (targetChannel && targetChannel instanceof TextChannel) {
        // Send to the specified channel
        logger.info(`Sending Baro inventory to channel: ${targetChannel.name}`);
        await targetChannel.send({ embeds: [baroEmbed] });
        
        const successEmbed = createEmbed({
          type: 'success',
          title: 'Baro Ki\'Teer',
          description: `Inventory has been sent to ${targetChannel}`,
          timestamp: true
        });
        
        await interaction.editReply({ embeds: [successEmbed] });
        return;
      } else {
        // Reply to the command directly
        logger.info(`Sending Baro inventory directly to command interaction`);
        await interaction.editReply({ embeds: [baroEmbed] });
        return;
      }
    } catch (error) {
      logger.error('Error fetching Baro inventory:', error);
      
      const errorEmbed = createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to fetch Baro Ki\'Teer\'s inventory. Please try again later.',
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }
  }
};

export = command; 