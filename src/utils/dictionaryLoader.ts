import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { EventEmitter } from 'events';

// Event emitter for dictionary updates
export const dictionaryEvents = new EventEmitter();

// Dictionary cache to prevent repeated file reads
interface DictionaryCache {
  [filename: string]: Record<string, any>;
}

// Cache for dictionary lookups
let dictionaryCache: DictionaryCache = {};
let nameCache: Map<string, string> = new Map();
let languageDict: Record<string, string> = {};
let isInitialized = false;

// Max size for the LRU cache
const MAX_CACHE_SIZE = 1000;

/**
 * Load all dictionary files into memory
 */
export const initializeDictionaries = async (): Promise<void> => {
  if (isInitialized) {
    return;
  }
  
  // Set up event listener for dictionary updates
  dictionaryEvents.on('dictionaryUpdated', (filenames: string[]) => {
    logger.info(`Dictionaries updated: ${filenames.join(', ')}. Refreshing cache.`);
    refreshDictionaryCache(filenames);
  });
  
  try {
    const dictPath = path.join(process.cwd(), 'dict');
    const files = fs.readdirSync(dictPath);
    
    // Initialize name cache
    nameCache = new Map();
    
    // Load language dictionary first (most important)
    const languageDictPath = path.join(dictPath, 'dict.en.json');
    if (fs.existsSync(languageDictPath)) {
      try {
        const fileContent = fs.readFileSync(languageDictPath, 'utf8');
        languageDict = JSON.parse(fileContent);
        logger.info(`Loaded English language dictionary with ${Object.keys(languageDict).length} entries`);
      } catch (err) {
        logger.error(`Error loading English language dictionary:`, err);
        languageDict = {};
      }
    } else {
      logger.error(`English language dictionary file not found at: ${languageDictPath}`);
      languageDict = {};
    }
    
    // Process each dictionary file
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'dict.en.json' && file.startsWith('Export')) {
        const filePath = path.join(dictPath, file);
        logger.info(`Loading dictionary: ${file}`);
        
        try {
          // Read and parse the dictionary file
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const dict = JSON.parse(fileContent);
          
          // Store in cache by filename
          dictionaryCache[file] = dict;
          
          // Log dictionary size
          const dictSize = Object.keys(dict).length;
          logger.info(`Loaded ${dictSize} entries from ${file}`);
        } catch (err) {
          logger.error(`Error loading dictionary ${file}:`, err);
        }
      }
    }
    
    isInitialized = true;
    logger.info(`Loaded ${Object.keys(dictionaryCache).length} dictionaries`);
  } catch (error) {
    logger.error('Failed to initialize dictionaries:', error);
    throw error;
  }
};

/**
 * Refresh the dictionary cache when files are updated
 * This is called by the dictionary updater service
 */
export const refreshDictionaryCache = (filenames: string[]): void => {
  if (!isInitialized) {
    logger.warn('Dictionary cache refresh requested but dictionaries not initialized yet');
    return;
  }
  
  const dictPath = path.join(process.cwd(), 'dict');
  
  // Clear name cache since it might contain outdated entries
  nameCache.clear();
  
  // Refresh language dictionary if updated
  if (filenames.includes('dict.en.json')) {
    const languageDictPath = path.join(dictPath, 'dict.en.json');
    try {
      const fileContent = fs.readFileSync(languageDictPath, 'utf8');
      languageDict = JSON.parse(fileContent);
      logger.info(`Refreshed English language dictionary with ${Object.keys(languageDict).length} entries`);
    } catch (err) {
      logger.error(`Error refreshing English language dictionary:`, err);
    }
  }
  
  // Refresh specific dictionaries
  for (const filename of filenames) {
    if (filename !== 'dict.en.json' && filename.endsWith('.json')) {
      const filePath = path.join(dictPath, filename);
      if (fs.existsSync(filePath)) {
        try {
          // Read and parse the updated dictionary file
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const dict = JSON.parse(fileContent);
          
          // Update the cache
          dictionaryCache[filename] = dict;
          logger.info(`Refreshed dictionary ${filename} with ${Object.keys(dict).length} entries`);
        } catch (err) {
          logger.error(`Error refreshing dictionary ${filename}:`, err);
        }
      }
    }
  }
  
  logger.info('Dictionary cache refresh complete');
};

/**
 * Get the appropriate dictionary file for an item path
 */
const getAppropriateDict = (itemPath: string): [string, Record<string, any>] | null => {
  // Try to determine the appropriate dictionary based on the path
  if (itemPath.includes('/Projections/')) {
    logger.debug(`Item path ${itemPath} appears to be a relic, using ExportRelics.json`);
    return ['ExportRelics.json', dictionaryCache['ExportRelics.json'] || {}];
  } else if (itemPath.includes('/Weapons/')) {
    logger.debug(`Item path ${itemPath} appears to be a weapon, using ExportWeapons.json`);
    return ['ExportWeapons.json', dictionaryCache['ExportWeapons.json'] || {}];
  } else if (itemPath.includes('/Warframes/')) {
    logger.debug(`Item path ${itemPath} appears to be a warframe, using ExportWarframes.json`);
    return ['ExportWarframes.json', dictionaryCache['ExportWarframes.json'] || {}];
  } else if (itemPath.includes('/Upgrades/')) {
    logger.debug(`Item path ${itemPath} appears to be an upgrade, using ExportUpgrades.json`);
    return ['ExportUpgrades.json', dictionaryCache['ExportUpgrades.json'] || {}];
  } else if (itemPath.includes('/Items/')) {
    logger.debug(`Item path ${itemPath} appears to be a misc item, using ExportMisc.json`);
    return ['ExportMisc.json', dictionaryCache['ExportMisc.json'] || {}];
  } else if (itemPath.includes('/Types/Items/')) {
    logger.debug(`Item path ${itemPath} appears to be a misc item, using ExportMisc.json`);
    return ['ExportMisc.json', dictionaryCache['ExportMisc.json'] || {}];
  } else if (itemPath.includes('/Sentinels/')) {
    logger.debug(`Item path ${itemPath} appears to be a sentinel, using ExportSentinels.json`);
    return ['ExportSentinels.json', dictionaryCache['ExportSentinels.json'] || {}];
  } else if (itemPath.includes('/Skins/')) {
    logger.debug(`Item path ${itemPath} appears to be a skin, using ExportCustoms.json`);
    return ['ExportCustoms.json', dictionaryCache['ExportCustoms.json'] || {}];
  } else if (itemPath.includes('/Recipes/')) {
    logger.debug(`Item path ${itemPath} appears to be a recipe, using ExportRecipes.json`);
    return ['ExportRecipes.json', dictionaryCache['ExportRecipes.json'] || {}];
  } else if (itemPath.includes('/Resources/')) {
    logger.debug(`Item path ${itemPath} appears to be a resource, using ExportResources.json`);
    return ['ExportResources.json', dictionaryCache['ExportResources.json'] || {}];
  } else if (itemPath.includes('/Keys/')) {
    logger.debug(`Item path ${itemPath} appears to be a key, using ExportKeys.json`);
    return ['ExportKeys.json', dictionaryCache['ExportKeys.json'] || {}];
  } else if (itemPath.includes('/Boosters/')) {
    logger.debug(`Item path ${itemPath} appears to be a booster, using ExportBoosters.json`);
    return ['ExportBoosters.json', dictionaryCache['ExportBoosters.json'] || {}];
  } else if (itemPath.includes('/Packages/')) {
    logger.debug(`Item path ${itemPath} appears to be a bundle, using ExportBundles.json`);
    return ['ExportBundles.json', dictionaryCache['ExportBundles.json'] || {}];
  }
  
  // If we can't determine based on path, we'll check all dictionaries
  logger.debug(`Could not determine appropriate dictionary for ${itemPath}, will check all dictionaries`);
  
  // First, check if the exact path exists in any dictionary
  for (const [fileName, dict] of Object.entries(dictionaryCache)) {
    if (dict[itemPath]) {
      logger.debug(`Found exact match for ${itemPath} in ${fileName}`);
      return [fileName, dict];
    }
  }
  
  // If no exact match found, we'll look for the path with StoreItems removed
  const altPath = itemPath.replace(/\/StoreItems\/?/g, '/');
  if (altPath !== itemPath) {
    logger.debug(`Trying alternate path: ${altPath}`);
    for (const [fileName, dict] of Object.entries(dictionaryCache)) {
      if (dict[altPath]) {
        logger.debug(`Found match for alternate path ${altPath} in ${fileName}`);
        return [fileName, dict];
      }
    }
  }
  
  logger.debug(`No dictionary found for item ${itemPath}`);
  return null;
};

/**
 * Get item details from appropriate dictionary
 * This is a wrapper around findItemInDicts for backward compatibility
 * 
 * @param itemPath The item path to look up
 * @returns Item details or null if not found
 */
export function getItemDetails(itemPath: string): { translatedName?: string } | null {
  if (!itemPath) {
    logger.warn('getItemDetails called with empty itemPath');
    return null;
  }
  
  // Use the optimized findItemInDicts function
  return findItemInDicts(itemPath);
}

/**
 * Get a localized name for an item
 * 
 * @param itemPath The item path to look up
 * @param fallback Optional fallback value if not found
 * @returns The localized name or fallback
 */
export const getLocalizedName = (itemPath: string, fallback?: string): string => {
  if (!isInitialized) {
    throw new Error('Dictionaries not initialized. Call initializeDictionaries() first.');
  }
  
  try {
    // Direct lookup in language dictionary first (most efficient)
    if (languageDict[itemPath]) {
      logger.debug(`Direct match in language dictionary for ${itemPath}: ${languageDict[itemPath]}`);
      return languageDict[itemPath];
    }
    
    // Get item details which includes looking up the name
    const itemDetails = getItemDetails(itemPath);
    
    if (itemDetails) {
      // If we got a translated name from getItemDetails
      if (itemDetails.translatedName) {
        logger.debug(`Using translated name: ${itemDetails.translatedName}`);
        return itemDetails.translatedName;
      }
    }
    
    // If all else fails, extract a simple name from the path
    const simpleName = itemPath.split('/').pop();
    logger.debug(`Using fallback name from path: ${simpleName}`);
    return fallback || simpleName || 'Unknown';
  } catch (error) {
    logger.error(`Error getting localized name for ${itemPath}:`, error);
    // Return the fallback or extract name from path in case of error
    const simpleName = itemPath.split('/').pop();
    return fallback || simpleName || 'Unknown';
  }
};

/**
 * Get the dictionary by name
 * 
 * @param name The dictionary filename
 * @returns The dictionary object
 */
export const getDictionary = (name: string): Record<string, any> | null => {
  if (!isInitialized) {
    throw new Error('Dictionaries not initialized. Call initializeDictionaries() first.');
  }
  
  return dictionaryCache[name] || null;
};

/**
 * Direct lookup for item paths from any dictionary
 * This is a more direct and reliable approach than getItemDetails
 */
export function findItemInDicts(itemPath: string): { name?: string, translatedName?: string, era?: string, category?: string } | null {
  if (!isInitialized) {
    throw new Error('Dictionaries not initialized. Call initializeDictionaries() first.');
  }

  // First check cache for this exact path
  if (nameCache.has(itemPath)) {
    const cachedName = nameCache.get(itemPath);
    return cachedName ? { translatedName: cachedName } : null;
  }

  // Priority lookup paths in order of most likely to match
  // This is optimized based on what we know about Baro items
  const pathsToTry = [
    // Original path (with StoreItems) - some items might be stored as-is
    itemPath,
    
    // Path without StoreItems - most common format in the dictionaries
    itemPath.replace('/StoreItems/', '/'),
    
    // Path with no StoreItems at all
    itemPath.replace(/\/StoreItems/g, '')
  ];
  
  // Special case for quests with KeyBlueprint
  if (itemPath.includes('/Keys/') && itemPath.includes('KeyBlueprint')) {
    logger.debug(`Identified item as quest blueprint: ${itemPath}`);
    
    // Check recipes dictionary for the blueprint
    if (dictionaryCache['ExportRecipes.json']) {
      const recipesDict = dictionaryCache['ExportRecipes.json'];
      
      // Try each path variation
      for (const path of pathsToTry) {
        logger.debug(`Looking for quest blueprint with path: ${path}`);
        
        if (recipesDict[path]) {
          const recipeData = recipesDict[path];
          logger.debug(`Found quest blueprint data: ${JSON.stringify(recipeData)}`);
          
          // Get the resultType from the recipe
          if (recipeData.resultType) {
            const resultType = recipeData.resultType;
            logger.debug(`Found quest resultType: ${resultType}`);
            
            // Look up the resultType in ExportKeys.json
            if (dictionaryCache['ExportKeys.json']) {
              const keysDict = dictionaryCache['ExportKeys.json'];
              
              if (keysDict[resultType]) {
                const keyData = keysDict[resultType];
                logger.debug(`Found key data: ${JSON.stringify(keyData)}`);
                
                // If the key has a name field, look it up in the language dictionary
                if (keyData.name && languageDict[keyData.name]) {
                  const translation = languageDict[keyData.name];
                  logger.debug(`Found quest name: ${translation}`);
                  
                  // Cache the result for future lookups
                  nameCache.set(itemPath, translation);
                  
                  return {
                    name: keyData.name,
                    translatedName: translation
                  };
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Check if this is a relic - special handling for projections
  if (itemPath.includes('/Projections/')) {
    logger.debug(`Identified item as relic: ${itemPath}`);
    // Check ExportRelics.json specifically
    if (dictionaryCache['ExportRelics.json']) {
      const relicsDict = dictionaryCache['ExportRelics.json'];
      
      // Try each path variation
      for (const path of pathsToTry) {
        logger.debug(`Looking for relic with path: ${path}`);
        if (relicsDict[path]) {
          const relicData = relicsDict[path];
          logger.debug(`Found relic data: ${JSON.stringify(relicData)}`);
          
          // Relics use era and category directly rather than name
          if (relicData.era && relicData.category) {
            // No need to translate - era and category is the direct name
            return {
              era: relicData.era,
              category: relicData.category
            };
          }
        }
      }
    }
  }
  
  // Fast dictionary lookup based on path patterns
  const targetDict = itemPath.includes('/Weapons/') ? 'ExportWeapons.json' 
    : itemPath.includes('/Upgrades/') ? 'ExportUpgrades.json'
    : itemPath.includes('/Warframes/') ? 'ExportWarframes.json'
    : itemPath.includes('/Sentinels/') ? 'ExportSentinels.json'
    : itemPath.includes('/Skins/') ? 'ExportCustoms.json'
    : null;
  
  // If we identified a specific dictionary, try it first for speed
  if (targetDict && dictionaryCache[targetDict]) {
    const dict = dictionaryCache[targetDict];
    
    // Try each path variation in the target dictionary
    for (const path of pathsToTry) {
      if (dict[path]) {
        const itemData = dict[path];
        
        // If it has a name field, look it up in the language dictionary
        if (itemData.name && languageDict[itemData.name]) {
          const translation = languageDict[itemData.name];
          
          // Cache the result for future lookups
          nameCache.set(itemPath, translation);
          
          return {
            name: itemData.name,
            translatedName: translation
          };
        }
      }
    }
    
    // If specific dictionary didn't yield results, special handling for paths
    const segments = itemPath.split('/');
    const lastSegments = '/' + segments.slice(-3).join('/');
    
    // Fast search for items ending with the same path segments
    for (const dictKey of Object.keys(dict)) {
      if (dictKey.endsWith(lastSegments)) {
        const itemData = dict[dictKey];
        
        if (itemData.name && languageDict[itemData.name]) {
          const translation = languageDict[itemData.name];
          nameCache.set(itemPath, translation);
          
          return {
            name: itemData.name,
            translatedName: translation
          };
        }
      }
    }
  }
  
  // Fallback: Try all dictionaries but only with the most likely path format
  // This is less optimized but comprehensive
  for (const path of pathsToTry.slice(0, 2)) { // Only try the first two path variations to keep it fast
    for (const [dictName, dict] of Object.entries(dictionaryCache)) {
      if (dict[path]) {
        const itemData = dict[path];
        
        if (itemData.name && languageDict[itemData.name]) {
          const translation = languageDict[itemData.name];
          nameCache.set(itemPath, translation);
          
          return {
            name: itemData.name,
            translatedName: translation
          };
        }
      }
    }
  }
  
  // Cache the negative result to avoid repeated lookups
  nameCache.set(itemPath, '');
  return null;
} 