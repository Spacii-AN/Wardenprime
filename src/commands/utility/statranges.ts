import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, EmbedBuilder, ApplicationCommandOptionChoiceData } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { warframeData } from '../../index';
import { logger } from '../../utils/logger';
import { weaponLookupService } from '../../services/weaponLookupService';
import * as path from 'path';
import * as fs from 'fs';

// Load the RivenParser library
const RivenParser = require('../../rivenparser.js');

// Define types for Warframe data
interface WarframeDataDict {
  [key: string]: string;
}

interface WarframeWeaponsData {
  [key: string]: WeaponData;
}

interface WarframeData {
  dict?: WarframeDataDict;
  ExportWeapons?: WarframeWeaponsData;
}

// Define types for weapon data
interface WeaponData {
  name: string;
  productCategory?: string;
  holsterCategory?: string;
  omegaAttenuation?: number;
  primeOmegaAttenuation?: number;
  excludeFromCodex?: boolean;
  totalDamage?: number;
  compatibilityTags?: string[];
  behaviors?: any[];
  [key: string]: any;
}

interface RivenFingerprint {
  lvl: number;
  buffs: Array<{ Tag: string; Value: number }>;
  curses: Array<{ Tag: string; Value: number }>;
}

interface StatResult {
  tag: string;
  displayValue: number;
  value: number;
  isCompatible: boolean;
  category: string;
}

// Stat categories for grouping and sorting
const statCategories: Record<string, string> = {
  // Damage stats
  "WeaponDamageAmountMod": "damage",
  "WeaponMeleeDamageMod": "damage",
  "WeaponArmorPiercingDamageMod": "damage",
  "WeaponImpactDamageMod": "damage",
  "WeaponSlashDamageMod": "damage",
  "WeaponFireIterationsMod": "damage",

  // Critical stats
  "WeaponCritChanceMod": "critical",
  "WeaponCritDamageMod": "critical",
  "SlideAttackCritChanceMod": "critical",

  // Status stats
  "WeaponStunChanceMod": "status",
  "WeaponProcTimeMod": "status",

  // Elemental damage
  "WeaponElectricityDamageMod": "elemental",
  "WeaponFireDamageMod": "elemental",
  "WeaponFreezeDamageMod": "elemental",
  "WeaponToxinDamageMod": "elemental",

  // Faction damage
  "WeaponFactionDamageCorpus": "faction",
  "WeaponFactionDamageGrineer": "faction",
  "WeaponFactionDamageInfested": "faction",
  "WeaponMeleeFactionDamageCorpus": "faction",
  "WeaponMeleeFactionDamageGrineer": "faction",
  "WeaponMeleeFactionDamageInfested": "faction",

  // Quality of life
  "WeaponFireRateMod": "qol",
  "WeaponReloadSpeedMod": "qol",
  "WeaponAmmoMaxMod": "qol",
  "WeaponClipMaxMod": "qol",
  "WeaponProjectileSpeedMod": "qol",
  "WeaponPunctureDepthMod": "qol",
  "WeaponRecoilReductionMod": "qol",
  "WeaponZoomFovMod": "qol",

  // Melee specific
  "ComboDurationMod": "melee",
  "WeaponMeleeRangeIncMod": "melee",
  "WeaponMeleeFinisherDamageMod": "melee",
  "WeaponMeleeComboEfficiencyMod": "melee",
  "WeaponMeleeComboInitialBonusMod": "melee",
  "WeaponMeleeComboPointsOnHitMod": "melee",
  "WeaponMeleeComboBonusOnHitMod": "melee"
};

// Format stat names for better readability
const statNameMap: Record<string, string> = {
  "WeaponArmorPiercingDamageMod": "Puncture Damage",
  "WeaponCritChanceMod": "Critical Chance",
  "WeaponCritDamageMod": "Critical Damage",
  "WeaponElectricityDamageMod": "Electricity Damage",
  "WeaponFireDamageMod": "Heat Damage",
  "WeaponFireRateMod": "Fire Rate",
  "WeaponFreezeDamageMod": "Cold Damage",
  "WeaponImpactDamageMod": "Impact Damage",
  "WeaponProcTimeMod": "Status Duration",
  "WeaponSlashDamageMod": "Slash Damage",
  "WeaponStunChanceMod": "Status Chance",
  "WeaponToxinDamageMod": "Toxin Damage",
  "WeaponAmmoMaxMod": "Ammo Maximum",
  "WeaponClipMaxMod": "Magazine Capacity",
  "WeaponDamageAmountMod": "Damage",
  "WeaponFireIterationsMod": "Multishot",
  "WeaponProjectileSpeedMod": "Projectile Speed",
  "WeaponPunctureDepthMod": "Punch Through",
  "WeaponRecoilReductionMod": "Recoil",
  "WeaponReloadSpeedMod": "Reload Speed",
  "WeaponZoomFovMod": "Zoom",
  "WeaponFactionDamageCorpus": "Damage to Corpus",
  "WeaponFactionDamageGrineer": "Damage to Grineer",
  "WeaponFactionDamageInfested": "Damage to Infested",
  "WeaponMeleeDamageMod": "Melee Damage",
  "WeaponMeleeFactionDamageCorpus": "Melee Damage to Corpus",
  "WeaponMeleeFactionDamageGrineer": "Melee Damage to Grineer",
  "WeaponMeleeFactionDamageInfested": "Melee Damage to Infested",
  "ComboDurationMod": "Combo Duration",
  "SlideAttackCritChanceMod": "Slide Crit Chance",
  "WeaponMeleeRangeIncMod": "Range",
  "WeaponMeleeFinisherDamageMod": "Finisher Damage",
  "WeaponMeleeComboEfficiencyMod": "Combo Efficiency",
  "WeaponMeleeComboInitialBonusMod": "Initial Combo",
  "WeaponMeleeComboPointsOnHitMod": "Melee Combo Count Chance",
  "WeaponMeleeComboBonusOnHitMod": "Heavy Attack Efficiency"
};

// Stats that need reversed symbols for display
const reverseSymbolStats: string[] = [
  "WeaponDamageAmountMod",
  "WeaponCritChanceMod",
  "WeaponCritDamageMod"
];

// Mapping for damage types to match with weapon stats
const upgradeTagToDamageType: Record<string, string> = {
  "WeaponImpactDamageMod": "DT_IMPACT",
  "WeaponArmorPiercingDamageMod": "DT_PUNCTURE",
  "WeaponSlashDamageMod": "DT_SLASH",
  "WeaponElectricityDamageMod": "DT_ELECTRICITY",
  "WeaponFireDamageMod": "DT_FIRE",
  "WeaponFreezeDamageMod": "DT_FREEZE",
  "WeaponToxinDamageMod": "DT_POISON",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('statranges')
    .setDescription('Shows all possible stat ranges for a Riven mod')
    .addStringOption(option => 
      option.setName('weapon')
        .setDescription('The weapon to check stat ranges for')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('buffs')
        .setDescription('Number of positive stats (2-3, default: 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(3))
    .addIntegerOption(option =>
      option.setName('curses')
        .setDescription('Number of negative stats (0-2, default: 1)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(2)) as SlashCommandBuilder,
  
  // Add autocomplete handler using our weaponLookupService
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    logger.debug(`Autocomplete triggered with value: "${focusedValue}"`);
    
    // Hardcoded fallback weapons to ensure we always return something
    const fallbackOptions = [
      { name: 'Kuva Bramma', value: 'Kuva Bramma' },
      { name: 'Rubico Prime', value: 'Rubico Prime' },
      { name: 'Ignis Wraith', value: 'Ignis Wraith' },
      { name: 'Kronen Prime', value: 'Kronen Prime' },
      { name: 'Kuva Nukor', value: 'Kuva Nukor' }
    ];
    
    try {
      // Direct synchronous file access - simpler approach
      const weaponMapPath = path.join(process.cwd(), 'dict', 'weaponArray.json');
      
      if (!fs.existsSync(weaponMapPath)) {
        logger.warn(`weaponArray.json not found at ${weaponMapPath}`);
        await interaction.respond(fallbackOptions);
      return;
    }
    
      try {
        // Read and parse the file in one go
        const weaponData = JSON.parse(fs.readFileSync(weaponMapPath, 'utf8'));
        logger.debug(`Successfully loaded weapon data with ${weaponData.length} entries`);
        
        // Simple transformation to name-value pairs
        const weaponOptions = weaponData
          .filter((w: any) => w && w.name && typeof w.name === 'string')
          .map((w: any) => ({ 
            name: w.name, 
            value: w.name 
          }));
        
        logger.debug(`Transformed to ${weaponOptions.length} weapon options`);
        
        // Filter options based on input
        let filtered = weaponOptions;
        if (focusedValue && focusedValue.length > 0) {
          filtered = weaponOptions.filter((option: {name: string; value: string}) => 
            option.name.toLowerCase().includes(focusedValue)
          ).slice(0, 25); // Discord's maximum
        } else {
          // Without input, just show some popular weapons as defaults
          filtered = weaponOptions.slice(0, 25);
        }
        
        logger.debug(`Returning ${filtered.length} filtered options`);
        
        // If we have results, send them
        if (filtered.length > 0) {
          await interaction.respond(filtered);
          return;
        }
      } catch (error) {
        logger.error('Error processing weapon data:', error);
      }
    } catch (error) {
      logger.error('Autocomplete error:', error);
    }
    
    // Fallback response - always ensure we respond with something
    logger.debug('Using fallback options for response');
    try {
      const filteredFallbacks = focusedValue 
        ? fallbackOptions.filter(opt => opt.name.toLowerCase().includes(focusedValue))
        : fallbackOptions;
    
    await interaction.respond(
        filteredFallbacks.length > 0 ? filteredFallbacks : [
          { name: 'No matching weapons', value: 'none' }
        ]
    );
    } catch (finalError) {
      logger.error('Critical error in autocomplete fallback:', finalError);
    }
  },
  
  // Execute command handler
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    // Get weapon name from user input
    const weaponName = interaction.options.getString('weapon');
    // Get optional buffs/curses, use defaults if not provided
    const buffs = interaction.options.getInteger('buffs') ?? 3;
    const curses = interaction.options.getInteger('curses') ?? 1;
    
    // Basic validation for total stats
    const totalStats = buffs + curses;
    if (totalStats < 2 || totalStats > 4) {
        const errorEmbed = createEmbed({
            type: 'error',
            title: 'Invalid Stat Combination',
            description: `A riven must have between 2 and 4 total stats (positive + negative). You provided ${buffs} positive and ${curses} negative.`, 
            timestamp: true
        });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
    }
    
    try {
      // Verify warframeData is loaded
      if (!warframeData.dict || !warframeData.ExportWeapons) {
        throw new Error('Warframe data not loaded. Please try again later.');
      }
      
      // Find the weapon data with our improved method
      const weaponData = await findWeapon(weaponName as string);
      
      if (!weaponData) {
        const notFoundEmbed = createEmbed({
          type: 'error',
          title: 'Weapon Not Found',
          description: `Could not find weapon: ${weaponName}`,
          timestamp: true
        });
        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }
      
      // Generate the embed with stat ranges
      const embed = generateStatsEmbed(weaponData, 8, buffs, curses);
      
      // Add additional info to the embed
      embed.setTitle(`Riven Stats: ${weaponData.name}`);
      embed.setDescription(`Disposition: ${weaponData.omegaAttenuation.toFixed(2)}x | Buffs: ${buffs} | Curses: ${curses}`);
      embed.setFooter({ text: 'ⓘ Stat likely incompatible with this weapon' });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error executing statranges command:', error);
      
      const errorEmbed = createEmbed({
        type: 'error',
        title: 'Error',
        description: 'An error occurred while processing your request.',
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

/**
 * Find a weapon by name using our new weaponLookupService
 */
async function findWeapon(weaponName: string) {
  try {
    logger.debug(`Searching for weapon: "${weaponName}"`);
    
    // Use weaponLookupService first (most efficient)
    const weaponInfo = weaponLookupService.findWeapon(weaponName);
    
    if (weaponInfo) {
      // For display purposes, get the proper weapon name
      let displayName = weaponName; // Default fallback
      
      // Try to find display name from weaponArray.json
      try {
        const weaponMapPath = path.join(process.cwd(), 'dict', 'weaponArray.json');
        if (fs.existsSync(weaponMapPath)) {
          const arrayData = fs.readFileSync(weaponMapPath, 'utf8');
          const weaponArray: WeaponData[] = JSON.parse(arrayData);
          
          const weaponEntry = weaponArray.find(w => 
            w.name.toLowerCase() === weaponInfo.name.toLowerCase()
          );
          
          if (weaponEntry) {
            displayName = weaponEntry.name;
            logger.debug(`Found weapon display name: "${displayName}"`);
          }
        }
      } catch (error) {
        logger.error('Error getting display name:', error);
      }
      
      // Return data with proper weapon info
      return {
        name: displayName, // Use the properly capitalized display name
        rivenType: weaponInfo.rivenType,
        omegaAttenuation: weaponInfo.omegaAttenuation,
        data: weaponInfo.data
      };
    }
    
    // Fall back to the old method if our lookup service doesn't find the weapon
    const dict = warframeData.dict as WarframeDataDict;
    const exportWeapons = warframeData.ExportWeapons as WarframeWeaponsData;
    
    // Convert input to lowercase for case-insensitive matching
    const searchName = weaponName.toLowerCase();
    
    // Match by display name in dictionary
    let internalPath: string | null = null;
    
    for (const [path, name] of Object.entries(dict)) {
      if (typeof name === 'string' && name.toLowerCase() === searchName) {
        internalPath = path;
        break;
      }
    }
    
    if (!internalPath) {
      logger.debug(`No exact dictionary match for "${weaponName}"`);
      return null;
    }
    
    // Find weapon data using the path
    let foundWeapon: WeaponData | null = null;
    
    // First try direct match in ExportWeapons
    if (exportWeapons[internalPath]) {
      foundWeapon = exportWeapons[internalPath];
    } 
    // Then try finding by matching the weapon's internal name property
    else {
      for (const weaponData of Object.values(exportWeapons)) {
        if (weaponData.name === internalPath) {
          foundWeapon = weaponData;
          break;
        }
      }
    }
    
    if (!foundWeapon) {
      logger.debug(`Found path "${internalPath}" but no matching weapon data`);
      return null;
    }
    
    // Determine riven type based on weapon category/type
    let rivenType = "LotusRifleRandomModRare"; // Default
    
    if (foundWeapon.productCategory === "Pistols") {
      rivenType = "LotusPistolRandomModRare";
    } else if (foundWeapon.productCategory === "Melee" || foundWeapon.holsterCategory === "MELEE") {
      rivenType = "PlayerMeleeWeaponRandomModRare";
    } else if (foundWeapon.holsterCategory === "SHOTGUN") {
      rivenType = "LotusShotgunRandomModRare";
    } else if ("primeOmegaAttenuation" in foundWeapon) {
      rivenType = "LotusModularPistolRandomModRare";
    } else if (foundWeapon.omegaAttenuation !== 1.0 && !foundWeapon.excludeFromCodex && foundWeapon.totalDamage === 0) {
      rivenType = "LotusModularMeleeRandomModRare";
    } else if (foundWeapon.holsterCategory === "ARCHGUN") {
      rivenType = "LotusArchgunRandomModRare";
    }
    
    // Use the display name from the dictionary if available
    const displayName = (() => {
      for (const [path, name] of Object.entries(dict)) {
        if (path === internalPath && typeof name === 'string') {
          return name;
        }
      }
      return weaponName; // Fall back to user input
    })();
    
    return {
      name: displayName, // Use the properly capitalized display name
      rivenType: rivenType,
      omegaAttenuation: foundWeapon.omegaAttenuation || foundWeapon.primeOmegaAttenuation || 1.0,
      data: foundWeapon
    };
  } catch (error) {
    logger.error('Error finding weapon data:', error);
    throw error;
  }
}

/**
 * Generate the embed with stat ranges for the weapon
 */
function generateStatsEmbed(weaponData: any, lvl: number, buffs: number, curses: number) {
  const { rivenType, omegaAttenuation } = weaponData;
  
  // Calculate and organize all possible stats
  const possibleStats = RivenParser.riven_tags[rivenType];
  
  // Calculate buff and curse values for each possible stat
  const buffResults: StatResult[] = [];
  const curseResults: StatResult[] = [];
  
  for (const stat of possibleStats) {
    // Process buffs
    if (stat.prefix) { // Can be a buff
      const min = getBuffValue(rivenType, stat.tag, 0, omegaAttenuation, lvl, buffs, curses);
      const max = getBuffValue(rivenType, stat.tag, 1, omegaAttenuation, lvl, buffs, curses);
      
      buffResults.push({
        tag: stat.tag,
        displayValue: min.displayValue,
        value: min.value,
        isCompatible: isStatCompatibleWithWeapon(stat.tag, weaponData.data),
        category: statCategories[stat.tag] || 'other'
      });
      
      buffResults.push({
        tag: stat.tag,
        displayValue: max.displayValue,
        value: max.value,
        isCompatible: isStatCompatibleWithWeapon(stat.tag, weaponData.data),
        category: statCategories[stat.tag] || 'other'
      });
    }
    
    // Process curses
    if (stat.tag !== "WeaponMeleeComboBonusOnHitMod") { // Can be a curse
      const min = getCurseValue(rivenType, stat.tag, 0, omegaAttenuation, lvl, buffs, curses);
      const max = getCurseValue(rivenType, stat.tag, 1, omegaAttenuation, lvl, buffs, curses);
      
      // Some stats have reversed display values for curses
      const shouldReverse = reverseSymbolStats.includes(stat.tag);
      const displayMin = shouldReverse ? min.displayValue * -1 : min.displayValue;
      const displayMax = shouldReverse ? max.displayValue * -1 : max.displayValue;
      
      curseResults.push({
        tag: stat.tag,
        displayValue: displayMin,
        value: min.value,
        isCompatible: isStatCompatibleWithWeapon(stat.tag, weaponData.data, false),
        category: statCategories[stat.tag] || 'other'
      });
      
      curseResults.push({
        tag: stat.tag,
        displayValue: displayMax,
        value: max.value,
        isCompatible: isStatCompatibleWithWeapon(stat.tag, weaponData.data, false),
        category: statCategories[stat.tag] || 'other'
      });
    }
  }
  
  // Group buff stats by category and format for display
  const buffCategories: Record<string, StatResult[]> = {};
  
  for (const result of buffResults) {
    if (!buffCategories[result.category]) {
      buffCategories[result.category] = [];
    }
    buffCategories[result.category].push(result);
  }
  
  // Sort each category and create formatted text
  let buffText = '';
  const categoryOrder = ['damage', 'critical', 'status', 'elemental', 'faction', 'qol', 'melee', 'other'];
  
  for (const category of categoryOrder) {
    if (buffCategories[category]?.length) {
      // Group results by tag to get min/max pairs
      const statsByTag: Record<string, StatResult[]> = {};
      
      for (const result of buffCategories[category]) {
        if (!statsByTag[result.tag]) {
          statsByTag[result.tag] = [];
        }
        statsByTag[result.tag].push(result);
      }
      
      // Format each stat range
      for (const [tag, results] of Object.entries(statsByTag)) {
        if (results.length >= 2) {
          // Sort by value to get min and max
          results.sort((a, b) => a.value - b.value);
          const min = results[0];
          const max = results[results.length - 1];
          
          const statName = statNameMap[tag] || tag;
          const compatMarker = min.isCompatible ? '' : ' ⓘ';
          
          buffText += `**${statName}:** ${min.displayValue} to ${max.displayValue}${compatMarker}\n`;
        }
      }
    }
  }
  
  // Do the same for curses
  const curseCategories: Record<string, StatResult[]> = {};
  
  for (const result of curseResults) {
    if (!curseCategories[result.category]) {
      curseCategories[result.category] = [];
    }
    curseCategories[result.category].push(result);
  }
  
  // Format curse text
  let curseText = '';
  
  for (const category of categoryOrder) {
    if (curseCategories[category]?.length) {
      const statsByTag: Record<string, StatResult[]> = {};
      
      for (const result of curseCategories[category]) {
        if (!statsByTag[result.tag]) {
          statsByTag[result.tag] = [];
        }
        statsByTag[result.tag].push(result);
      }
      
      for (const [tag, results] of Object.entries(statsByTag)) {
        if (results.length >= 2) {
          // Sort by absolute value to handle negative numbers correctly
          results.sort((a, b) => Math.abs(a.displayValue) - Math.abs(b.displayValue));
          const min = results[0];
          const max = results[results.length - 1];
          
          const statName = statNameMap[tag] || tag;
          const compatMarker = min.isCompatible ? '' : ' ⓘ';
          
          curseText += `**${statName}:** ${min.displayValue} to ${max.displayValue}${compatMarker}\n`;
        }
      }
    }
  }
  
  // Create the embed
  const embed = createEmbed({
    type: 'info',
    title: `${weaponData.name} Riven Stat Ranges`,
    description: `Disposition: ${omegaAttenuation.toFixed(2)}x | Level: ${lvl} | **Buffs: ${buffs}** | **Curses: ${curses}**`,
    fields: [
      { name: 'Positive Stats', value: buffText || 'None available', inline: false }
    ],
    timestamp: true
  });
  
  // Add negative stats field if there are curses
  if (curses > 0) {
    embed.addFields([
      { name: 'Negative Stats', value: curseText || 'None available', inline: false }
    ]);
  }
  
  // Add note for incompatible stats
  if (buffText.includes('ⓘ') || curseText.includes('ⓘ')) {
    embed.setFooter({ text: 'ⓘ This stat cannot currently be rolled on this weapon.' });
  }
  
  return embed;
}

/**
 * Calculate min or max buff value
 */
function getBuffValue(rivenType: string, tag: string, tagValue: number, omegaAttenuation: number, lvl: number, buffs: number, curses: number) {
  tagValue = RivenParser.floatToRivenInt(tagValue);
  const fingerprint: RivenFingerprint = { lvl, buffs: [], curses: [] };
  let buffCount = buffs;
  do {
    fingerprint.buffs.push({ Tag: tag, Value: tagValue });
  } while (--buffCount > 0);
  
  let curseCount = curses;
  while (curseCount-- > 0) {
    fingerprint.curses.push({ Tag: "WeaponCritChanceMod", Value: 0 });
  }
  
  return RivenParser.parseRiven(rivenType, fingerprint, omegaAttenuation).stats[0];
}

/**
 * Calculate min or max curse value
 */
function getCurseValue(rivenType: string, tag: string, tagValue: number, omegaAttenuation: number, lvl: number, buffs: number, curses: number) {
  tagValue = RivenParser.floatToRivenInt(tagValue);
  const fingerprint: RivenFingerprint = { lvl, buffs: [], curses: [] };
  let buffCount = buffs;
  while (buffCount-- > 0) {
    fingerprint.buffs.push({ Tag: "WeaponCritChanceMod", Value: 0 });
  }
  
  let curseCount = curses;
  do {
    fingerprint.curses.push({ Tag: tag, Value: tagValue });
  } while (--curseCount > 0);
  
  return RivenParser.parseRiven(rivenType, fingerprint, omegaAttenuation).stats[fingerprint.buffs.length];
}

/**
 * Check if a stat is compatible with this weapon
 */
function isStatCompatibleWithWeapon(tag: string, weaponData: any, isBuff = true) {
  // Handle projectile speed compatibility
  if (tag === "WeaponProjectileSpeedMod" && 
      weaponData.compatibilityTags && 
      !weaponData.compatibilityTags.find((x: string) => x === "PROJECTILE")) {
    return false;
  }
  
  // Handle damage type compatibility
  if (tag in upgradeTagToDamageType) {
    const damageType = upgradeTagToDamageType[tag];
    if (!weaponCanRollDamageType(weaponData, damageType)) {
      const isPhysical = (damageType === "DT_IMPACT" || damageType === "DT_PUNCTURE" || damageType === "DT_SLASH");
      if (isPhysical || !isBuff) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Check if a weapon can roll a specific damage type
 */
function weaponCanRollDamageType(weaponData: WeaponData, damageType: string): boolean {
  if (!weaponData.behaviors) {
    return true;
  }
  const behavior = weaponData.behaviors[0];
  if (!behavior) return true;
  
  const damageTable = behavior.projectile?.attack ? behavior.projectile.attack : behavior.impact;
  if (!damageTable) return true;
  
  if (damageType in damageTable) {
    const damageValues: number[] = Object.values(damageTable) as number[];
    const totalDamage = damageValues.reduce((a: number, b: number) => a + b, 0);
    return (damageTable[damageType] / totalDamage) > 0.2;
  }
  return false;
}

export = command; 