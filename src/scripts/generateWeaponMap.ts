import * as fs from 'fs';
import * as path from 'path';

// Define weapon data structure from ExportWeapons.json
interface WeaponData {
  name: string;
  productCategory?: string;
  holsterCategory?: string;
  omegaAttenuation?: number;
  primeOmegaAttenuation?: number;
  excludeFromCodex?: boolean;
  totalDamage?: number;
  [key: string]: any; // Allow other properties
}

// Define the output structure
interface WeaponMapEntry {
  internalPath: string;
  displayName: string;
  category: string;
  disposition: number;
  rivenType: string;
}

/**
 * Determines the riven type based on weapon category and other properties
 */
function determineRivenType(weapon: WeaponData, internalPath: string): string {
  // Check for Ostron Melee (Zaw) in path
  if (internalPath.includes("/Ostron/Melee/")) {
    return "LotusModularMeleeRandomModRare";
  }
  
  if (weapon.productCategory === "Pistols") {
    return "LotusPistolRandomModRare";
  } else if (weapon.productCategory === "Melee" || weapon.holsterCategory === "MELEE") {
    return "PlayerMeleeWeaponRandomModRare";
  } else if (weapon.productCategory === "SpaceGuns" || weapon.holsterCategory === "ARCHGUN") {
    return "LotusArchgunRandomModRare";
  } else if (weapon.holsterCategory === "SHOTGUN") {
    return "LotusShotgunRandomModRare";
  } else if ("primeOmegaAttenuation" in weapon) {
    return "LotusModularPistolRandomModRare"; // Kitgun
  } else if (weapon.omegaAttenuation !== 1.0 && !weapon.excludeFromCodex && weapon.totalDamage === 0) {
    return "LotusModularMeleeRandomModRare"; // Zaw
  }
  
  return "LotusRifleRandomModRare"; // Default to rifle
}

/**
 * Generates a weapon map from ExportWeapons.json and dict.en.json
 */
async function generateWeaponMap() {
  try {
    // Define file paths
    const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
    const weaponsPath = path.join(process.cwd(), 'dict', 'ExportWeapons.json');
    const outputPath = path.join(process.cwd(), 'dict', 'weaponMap.json');
    
    // Load dictionary and weapons data
    console.log('Loading dictionary and weapons data...');
    const dictData = JSON.parse(fs.readFileSync(dictPath, 'utf8')) as Record<string, string>;
    const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8')) as Record<string, WeaponData>;
    
    // Create weapon map
    const weaponMap: { [key: string]: WeaponMapEntry } = {};
    const displayNameMap: { [key: string]: string[] } = {}; // Track display names to their internal paths
    
    // Process each weapon
    console.log('Processing weapons...');
    let processedCount = 0;
    let duplicateDisplayNameCount = 0;
    
    for (const [internalPath, weaponData] of Object.entries(weaponsData)) {
      // Skip entries that aren't proper weapons
      if (!weaponData.name || typeof weaponData.name !== 'string') {
        continue;
      }
      
      // Get the display name from the dictionary
      const namePath = weaponData.name;
      const displayName = dictData[namePath] || namePath;
      
      // Skip if we couldn't get a display name
      if (!displayName || typeof displayName !== 'string') {
        continue;
      }
      
      // Extract category
      const category = weaponData.productCategory || weaponData.holsterCategory || 'Unknown';
      
      // Extract disposition
      const disposition = 
        weaponData.omegaAttenuation || 
        weaponData.primeOmegaAttenuation || 
        1.0;
      
      // Determine riven type - pass internalPath as a parameter
      const rivenType = determineRivenType(weaponData, internalPath);
      
      // Add to map
      weaponMap[internalPath] = {
        internalPath,
        displayName,
        category,
        disposition,
        rivenType
      };
      
      // Add to display name tracking map
      const lowerDisplayName = displayName.toLowerCase();
      if (!displayNameMap[lowerDisplayName]) {
        displayNameMap[lowerDisplayName] = [];
      }
      displayNameMap[lowerDisplayName].push(internalPath);
      
      // Add an entry with the display name as the key for easier lookups
      // Only if this doesn't create a conflict (same display name for different weapons)
      if (displayNameMap[lowerDisplayName].length === 1) {
        weaponMap[lowerDisplayName] = {
          internalPath,
          displayName,
          category,
          disposition,
          rivenType
        };
      } else {
        // Remove any existing display name entry to avoid conflicts
        if (weaponMap[lowerDisplayName]) {
          delete weaponMap[lowerDisplayName];
          duplicateDisplayNameCount++;
        }
      }
      
      processedCount++;
    }
    
    console.log(`Processed ${processedCount} weapons (${duplicateDisplayNameCount} duplicate display names found)`);
    
    // Write to file
    fs.writeFileSync(outputPath, JSON.stringify(weaponMap, null, 2), 'utf8');
    console.log(`Weapon map saved to ${outputPath}`);
    
    // Also create a searchable array version that's deduplicated by display name
    const seenNames = new Set<string>();
    const weaponArray = Object.values(weaponMap)
      .filter(entry => {
        const lowerName = entry.displayName.toLowerCase();
        // Only include entries that have a unique display name
        if (seenNames.has(lowerName)) {
          return false;
        }
        seenNames.add(lowerName);
        return true;
      })
      .map(entry => ({
        name: entry.displayName,
        internalPath: entry.internalPath,
        category: entry.category,
        disposition: entry.disposition,
        rivenType: entry.rivenType
      }));
    
    const arrayOutputPath = path.join(process.cwd(), 'dict', 'weaponArray.json');
    fs.writeFileSync(arrayOutputPath, JSON.stringify(weaponArray, null, 2), 'utf8');
    console.log(`Weapon array saved to ${arrayOutputPath} (${weaponArray.length} unique weapons)`);
    
    // Create a lookup map by display name
    // Handle duplicates by including all versions in an array
    const lookupMap: { [key: string]: WeaponMapEntry[] } = {};
    for (const [displayName, internalPaths] of Object.entries(displayNameMap)) {
      lookupMap[displayName] = internalPaths.map(path => weaponMap[path]);
    }
    
    const lookupMapPath = path.join(process.cwd(), 'dict', 'weaponLookup.json');
    fs.writeFileSync(lookupMapPath, JSON.stringify(lookupMap, null, 2), 'utf8');
    console.log(`Weapon lookup map saved to ${lookupMapPath}`);
    
    return {
      weaponMap,
      weaponArray,
      lookupMap
    };
    
  } catch (error) {
    console.error('Error generating weapon map:', error);
    throw error;
  }
}

// Execute the function if this script is run directly
if (require.main === module) {
  console.log('Generating weapon maps...');
  generateWeaponMap()
    .then(() => console.log('Done! Weapon maps generated successfully.'))
    .catch(err => {
      console.error('Failed to generate weapon maps:', err);
      process.exit(1);
    });
}

export { generateWeaponMap }; 