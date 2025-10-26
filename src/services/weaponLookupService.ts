import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// Define weapon data interfaces
export interface WeaponMapEntry {
  internalPath: string;
  displayName: string;
  category: string;
  disposition: number;
  rivenType: string;
}

export interface WeaponInfo {
  name: string;
  rivenType: string;
  omegaAttenuation: number;
  data: any;
}

// Class to manage weapon lookups with caching
class WeaponLookupService {
  private weaponLookup: Record<string, WeaponMapEntry[]> | null = null;
  private weaponMap: Record<string, WeaponMapEntry> | null = null;
  private weaponArray: WeaponMapEntry[] | null = null;
  private exportWeapons: Record<string, any> | null = null;
  private dictionary: Record<string, string> | null = null;
  
  constructor() {
    // Load the weapon data at service initialization
    this.loadWeaponData();
  }
  
  /**
   * Load all weapon data files into memory
   */
  private loadWeaponData(): void {
    try {
      const dictPath = path.join(process.cwd(), 'dict');
      
      // Check if the lookup files exist
      const lookupPath = path.join(dictPath, 'weaponLookup.json');
      const mapPath = path.join(dictPath, 'weaponMap.json');
      const arrayPath = path.join(dictPath, 'weaponArray.json');
      const weaponsPath = path.join(dictPath, 'ExportWeapons.json');
      const dictionaryPath = path.join(dictPath, 'dict.en.json');
      
      // Load all files if they exist
      if (fs.existsSync(lookupPath)) {
        logger.info('Loading weaponLookup.json...');
        this.weaponLookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
      }
      
      if (fs.existsSync(mapPath)) {
        logger.info('Loading weaponMap.json...');
        this.weaponMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      }
      
      if (fs.existsSync(arrayPath)) {
        logger.info('Loading weaponArray.json...');
        this.weaponArray = JSON.parse(fs.readFileSync(arrayPath, 'utf8'));
      }
      
      if (fs.existsSync(weaponsPath)) {
        logger.info('Loading ExportWeapons.json...');
        this.exportWeapons = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
      }
      
      if (fs.existsSync(dictionaryPath)) {
        logger.info('Loading dict.en.json...');
        this.dictionary = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'));
      }
      
      logger.info('Weapon lookup data successfully loaded');
    } catch (error) {
      logger.error('Failed to load weapon lookup data:', error);
    }
  }
  
  /**
   * Find a weapon by name using the most efficient method available
   */
  public findWeapon(weaponName: string): WeaponInfo | null {
    if (!weaponName) {
      return null;
    }
    
    // Ensure we have the required data
    if (!this.exportWeapons) {
      logger.warn('ExportWeapons data not loaded');
      return null;
    }
    
    try {
      logger.debug(`Searching for weapon: "${weaponName}"`);
      const searchName = weaponName.toLowerCase();
      
      // STRATEGY 1: Direct lookup in weaponLookup (most efficient for exact matches)
      if (this.weaponLookup && this.weaponLookup[searchName]) {
        const matches = this.weaponLookup[searchName];
        if (matches.length > 0) {
          const match = matches[0]; // Use the first match if multiple exist
          logger.debug(`Found weapon in weaponLookup: ${match.displayName} (${match.internalPath})`);
          
          return {
            name: match.internalPath,
            rivenType: match.rivenType,
            omegaAttenuation: match.disposition,
            data: this.exportWeapons[match.internalPath] || null
          };
        }
      }
      
      // STRATEGY 2: Direct lookup in weaponMap
      if (this.weaponMap && this.weaponMap[searchName]) {
        const match = this.weaponMap[searchName];
        logger.debug(`Found weapon in weaponMap: ${match.displayName} (${match.internalPath})`);
        
        return {
          name: match.internalPath,
          rivenType: match.rivenType,
          omegaAttenuation: match.disposition,
          data: this.exportWeapons[match.internalPath] || null
        };
      }
      
      // STRATEGY 3: Fuzzy search in weaponMap (for partial matches)
      // Only need to process this if we have a weaponMap and didn't find an exact match
      if (this.weaponMap) {
        // Extract all entries once to avoid repeatedly calling Object.values
        const entries = Object.values(this.weaponMap) as WeaponMapEntry[];
        
        // First try starts-with match (higher priority)
        for (const entry of entries) {
          if (entry.displayName.toLowerCase().startsWith(searchName)) {
            logger.debug(`Found prefix match in weaponMap: ${entry.displayName} (${entry.internalPath})`);
            
            return {
              name: entry.internalPath,
              rivenType: entry.rivenType,
              omegaAttenuation: entry.disposition,
              data: this.exportWeapons[entry.internalPath] || null
            };
          }
        }
        
        // Then try contains match (lower priority)
        for (const entry of entries) {
          if (entry.displayName.toLowerCase().includes(searchName)) {
            logger.debug(`Found partial match in weaponMap: ${entry.displayName} (${entry.internalPath})`);
            
            return {
              name: entry.internalPath,
              rivenType: entry.rivenType,
              omegaAttenuation: entry.disposition,
              data: this.exportWeapons[entry.internalPath] || null
            };
          }
        }
      }
      
      // STRATEGY 4: Array search - generally less efficient but good if map is not available
      if (this.weaponArray) {
        // First try exact match
        const exactMatch = this.weaponArray.find(entry => 
          entry.displayName.toLowerCase() === searchName
        );
        
        if (exactMatch) {
          logger.debug(`Found exact match in weaponArray: ${exactMatch.displayName}`);
          return {
            name: exactMatch.internalPath,
            rivenType: exactMatch.rivenType,
            omegaAttenuation: exactMatch.disposition,
            data: this.exportWeapons[exactMatch.internalPath] || null
          };
        }
        
        // Then try prefix match
        const prefixMatch = this.weaponArray.find(entry => 
          entry.displayName.toLowerCase().startsWith(searchName)
        );
        
        if (prefixMatch) {
          logger.debug(`Found prefix match in weaponArray: ${prefixMatch.displayName}`);
          return {
            name: prefixMatch.internalPath,
            rivenType: prefixMatch.rivenType,
            omegaAttenuation: prefixMatch.disposition,
            data: this.exportWeapons[prefixMatch.internalPath] || null
          };
        }
        
        // Finally try contains match
        const containsMatch = this.weaponArray.find(entry => 
          entry.displayName.toLowerCase().includes(searchName)
        );
        
        if (containsMatch) {
          logger.debug(`Found contains match in weaponArray: ${containsMatch.displayName}`);
          return {
            name: containsMatch.internalPath,
            rivenType: containsMatch.rivenType,
            omegaAttenuation: containsMatch.disposition,
            data: this.exportWeapons[containsMatch.internalPath] || null
          };
        }
      }
      
      // FALLBACK STRATEGY: Use dictionary lookup if all else fails
      if (this.dictionary && this.exportWeapons) {
        logger.debug('Falling back to dictionary search');
        for (const [path, name] of Object.entries(this.dictionary)) {
          if (typeof name === 'string' && name.toLowerCase() === searchName) {
            logger.debug(`Found exact match in dictionary: ${name} (${path})`);
            
            if (this.exportWeapons[path]) {
              const weaponData = this.exportWeapons[path];
              const rivenType = this.determineRivenType(weaponData);
              const disposition = weaponData.omegaAttenuation || weaponData.primeOmegaAttenuation || 1.0;
              
              return {
                name: path,
                rivenType,
                omegaAttenuation: disposition,
                data: weaponData
              };
            }
          }
        }
        
        // Try partial matching
        for (const [path, name] of Object.entries(this.dictionary)) {
          if (typeof name === 'string' && name.toLowerCase().includes(searchName)) {
            logger.debug(`Found partial match in dictionary: ${name} (${path})`);
            
            if (this.exportWeapons[path]) {
              const weaponData = this.exportWeapons[path];
              const rivenType = this.determineRivenType(weaponData);
              const disposition = weaponData.omegaAttenuation || weaponData.primeOmegaAttenuation || 1.0;
              
              return {
                name: path,
                rivenType,
                omegaAttenuation: disposition,
                data: weaponData
              };
            }
          }
        }
      }
      
      logger.debug(`No match found for "${weaponName}"`);
      return null;
      
    } catch (error) {
      logger.error('Error finding weapon data:', error);
      return null;
    }
  }
  
  /**
   * Determine the riven type based on weapon characteristics
   */
  private determineRivenType(weapon: any): string {
    if (weapon.productCategory === "Pistols") {
      return "LotusPistolRandomModRare";
    } else if (weapon.productCategory === "Melee" || weapon.holsterCategory === "MELEE") {
      return "PlayerMeleeWeaponRandomModRare";
    } else if (weapon.holsterCategory === "SHOTGUN") {
      return "LotusShotgunRandomModRare";
    } else if ("primeOmegaAttenuation" in weapon) {
      return "LotusModularPistolRandomModRare"; // Kitgun
    } else if (weapon.omegaAttenuation !== 1.0 && !weapon.excludeFromCodex && weapon.totalDamage === 0) {
      return "LotusModularMeleeRandomModRare"; // Zaw
    } else if (weapon.holsterCategory === "ARCHGUN") {
      return "LotusArchgunRandomModRare";
    }
    
    return "LotusRifleRandomModRare"; // Default to rifle
  }
  
  /**
   * Force reload of weapon data
   */
  public reloadWeaponData(): void {
    logger.info('Reloading weapon lookup data...');
    this.weaponLookup = null;
    this.weaponMap = null;
    this.weaponArray = null;
    this.exportWeapons = null;
    this.dictionary = null;
    this.loadWeaponData();
  }
}

// Create a singleton instance
export const weaponLookupService = new WeaponLookupService();

export default weaponLookupService; 