import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { warframeData } from '../../index';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs';
import { createCanvas } from 'canvas';
import fsSync from 'fs';
import { weaponLookupService } from '../../services/weaponLookupService';

// Load the RivenParser library
const RivenParser = require('../../rivenparser.js');

// Types and interfaces
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
  min: number;
  max: number;
  tag: string;
  displayName: string;
}

// Add interfaces for the map and lookup structures
interface WeaponMapEntry {
  internalPath: string;
  displayName: string;
  category: string;
  disposition: number;
  rivenType: string;
}

// Format stat names for better readability (copied from statranges.ts)
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

// Stats that are displayed as raw values but need to be treated as percentages internally
const rawValueStats: string[] = [
  "WeaponPunctureDepthMod", // Punch Through
  "WeaponMeleeRangeIncMod", // Range (Melee)
];

// Function to find a stat tag from its name
export function findTagForStatName(statName: string): string {
  // Remove any leading +/- signs and trim whitespace
  const normalizedName = statName.replace(/^[+-]\s*/, '').toLowerCase().trim();
  
  logger.debug(`Normalized stat name for lookup: "${normalizedName}"`);
  
  // Check for exact match first
  for (const [tag, displayName] of Object.entries(statNameMap)) {
    if (displayName.toLowerCase() === normalizedName) {
      return tag;
    }
  }
  
  // Handle faction damage special cases
  if (normalizedName === 'damage to corpus') {
    return "WeaponFactionDamageCorpus";
  }
  
  if (normalizedName === 'damage to grineer') {
    return "WeaponFactionDamageGrineer";
  }
  
  if (normalizedName === 'damage to infested') {
    return "WeaponFactionDamageInfested";
  }
  
  // Handle melee attack speed (which is internally "Fire Rate" in Warframe)
  if (normalizedName === 'attack speed') {
    return "WeaponFireRateMod";
  }
  
  // Handle partial matches for common cases
  if (normalizedName === 'cold') {
    return "WeaponFreezeDamageMod"; // Cold Damage
  }
  
  if (normalizedName === 'heat') {
    return "WeaponFireDamageMod"; // Heat Damage
  }
  
  if (normalizedName === 'electricity') {
    return "WeaponElectricityDamageMod"; // Electricity Damage
  }
  
  if (normalizedName === 'toxin') {
    return "WeaponToxinDamageMod"; // Toxin Damage
  }
  
  if (normalizedName === 'puncture') {
    return "WeaponArmorPiercingDamageMod"; // Puncture Damage
  }
  
  if (normalizedName === 'impact') {
    return "WeaponImpactDamageMod"; // Impact Damage
  }
  
  if (normalizedName === 'slash') {
    return "WeaponSlashDamageMod"; // Slash Damage
  }
  
  // Special case for slide attack critical chance
  if (normalizedName.includes('slide') && normalizedName.includes('crit')) {
    return "SlideAttackCritChanceMod";
  }
  
  if (normalizedName.includes('critical') && normalizedName.includes('slide')) {
    return "SlideAttackCritChanceMod";
  }
  
  // Additional check for "Slide Attack Critical Chance" exactly
  if (normalizedName === 'slide attack critical chance') {
    return "SlideAttackCritChanceMod";
  }
  
  // Additional check for "Critical Chance for Slide Attack" exactly
  if (normalizedName === 'critical chance for slide attack') {
    return "SlideAttackCritChanceMod";
  }
  
  // Check for contains matches as a fallback
  for (const [tag, displayName] of Object.entries(statNameMap)) {
    if (displayName.toLowerCase().includes(normalizedName) || 
        normalizedName.includes(displayName.toLowerCase())) {
      logger.debug(`Found partial match: "${normalizedName}" → "${displayName}" (${tag})`);
      return tag;
    }
  }
  
  // Handle special cases and common OCR errors
  if (normalizedName.includes('fire') && normalizedName.includes('rate')) {
    return "WeaponFireRateMod";
  }
  
  // Handle attack speed as fire rate for melee weapons
  if (normalizedName.includes('attack') && (normalizedName.includes('speed') || normalizedName.includes('rate'))) {
    return "WeaponFireRateMod";
  }
  
  // Handle faction damage by keywords
  if (normalizedName.includes('corpus')) {
    return "WeaponFactionDamageCorpus";
  }
  
  if (normalizedName.includes('grineer')) {
    return "WeaponFactionDamageGrineer";
  }
  
  if (normalizedName.includes('infested')) {
    return "WeaponFactionDamageInfested";
  }
  
  logger.warn(`Could not match stat name: "${statName}" (normalized: "${normalizedName}")`);
  return "unknown";
}

// Format weapon type from the riven type
export function formatRivenType(rivenType: string): string {
  const typeMap: Record<string, string> = {
    "LotusRifleRandomModRare": "Rifle",
    "LotusPistolRandomModRare": "Pistol",
    "PlayerMeleeWeaponRandomModRare": "Melee",
    "LotusShotgunRandomModRare": "Shotgun",
    "LotusModularPistolRandomModRare": "Kitgun",
    "LotusModularMeleeRandomModRare": "Zaw",
    "LotusArchgunRandomModRare": "Archgun"
  };
  
  return typeMap[rivenType] || "Mod";
}

// Update findWeapon function to use weaponArray.json first
export function findWeapon(weaponName: string, exportWeapons: any, dict: any) {
  if (!weaponName) {
    return null;
  }
  
  try {
    logger.debug(`Searching for weapon: "${weaponName}"`);
    
    // Try loading weaponArray.json directly
    try {
      const weaponArrayPath = path.join(process.cwd(), 'dict', 'weaponArray.json');
      if (fs.existsSync(weaponArrayPath)) {
        const weaponArrayData = fs.readFileSync(weaponArrayPath, 'utf8');
        const weaponArray = JSON.parse(weaponArrayData);
        
        // Search in weaponArray.json - this is now our primary source
        const searchName = weaponName.toLowerCase();
        
        // 1. Try exact match
        let match = weaponArray.find((w: any) => w.name.toLowerCase() === searchName);
        if (match) {
          logger.debug(`Found exact match in weaponArray: ${match.name}`);
          return {
            name: match.internalPath,
            rivenType: match.rivenType,
            omegaAttenuation: match.disposition,
            data: exportWeapons[match.internalPath] || null,
            displayName: match.name // Store the display name
          };
        }
        
        // 2. Try prefix match
        match = weaponArray.find((w: any) => w.name.toLowerCase().startsWith(searchName));
        if (match) {
          logger.debug(`Found prefix match in weaponArray: ${match.name}`);
          return {
            name: match.internalPath,
            rivenType: match.rivenType,
            omegaAttenuation: match.disposition,
            data: exportWeapons[match.internalPath] || null,
            displayName: match.name // Store the display name
          };
        }
        
        // 3. Try contains match
        match = weaponArray.find((w: any) => w.name.toLowerCase().includes(searchName));
        if (match) {
          logger.debug(`Found contains match in weaponArray: ${match.name}`);
          return {
            name: match.internalPath,
            rivenType: match.rivenType,
            omegaAttenuation: match.disposition,
            data: exportWeapons[match.internalPath] || null,
            displayName: match.name // Store the display name
          };
        }
      }
    } catch (weaponArrayError) {
      logger.warn(`Error loading weaponArray.json, falling back to legacy method: ${weaponArrayError}`);
    }
    
    // Use the weaponLookupService first for optimal performance
    const weaponInfo = weaponLookupService.findWeapon(weaponName);
    if (weaponInfo) {
      // Add displayName if available
      const displayName = dict[weaponInfo.name] || weaponInfo.name;
      return {
        ...weaponInfo,
        displayName
      };
    }
    
    // The following is kept as a fallback in case the service fails or isn't available
    // But in normal operation, the code should never reach this point
    logger.warn(`Weapon lookup service failed to find "${weaponName}", falling back to legacy method`);
    
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
      // Try partial matching if exact match failed
      for (const [path, name] of Object.entries(dict)) {
        if (typeof name === 'string' && name.toLowerCase().includes(searchName)) {
          internalPath = path;
          logger.debug(`Found partial match: ${name} (${path})`);
          break;
        }
      }
      
      if (!internalPath) {
        logger.debug(`No dictionary match for "${weaponName}"`);
        return null;
      }
    }
    
    // Find weapon data using the path
    let foundWeapon: WeaponData | null = null;
    
    // First try direct match in ExportWeapons
    if (exportWeapons[internalPath]) {
      foundWeapon = exportWeapons[internalPath];
    } 
    // Then try finding by matching the weapon's internal name property
    else {
      for (const weaponData of Object.values(exportWeapons) as WeaponData[]) {
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
    
    // Check for Ostron Melee (Zaw) in path
    if (internalPath.includes("/Ostron/Melee/")) {
      rivenType = "LotusModularMeleeRandomModRare";
    } else if (foundWeapon.productCategory === "Pistols") {
      rivenType = "LotusPistolRandomModRare";
    } else if (foundWeapon.productCategory === "Melee" || foundWeapon.holsterCategory === "MELEE") {
      rivenType = "PlayerMeleeWeaponRandomModRare";
    } else if (foundWeapon.productCategory === "SpaceGuns" || foundWeapon.holsterCategory === "ARCHGUN") {
      rivenType = "LotusArchgunRandomModRare";
    } else if (foundWeapon.holsterCategory === "SHOTGUN") {
      rivenType = "LotusShotgunRandomModRare";
    } else if ("primeOmegaAttenuation" in foundWeapon) {
      rivenType = "LotusModularPistolRandomModRare";
    } else if (foundWeapon.omegaAttenuation !== 1.0 && !foundWeapon.excludeFromCodex && foundWeapon.totalDamage === 0) {
      rivenType = "LotusModularMeleeRandomModRare";
    }
    
    return {
      name: internalPath, 
      rivenType: rivenType,
      omegaAttenuation: foundWeapon.omegaAttenuation || foundWeapon.primeOmegaAttenuation || 1.0,
      data: foundWeapon,
      displayName: dict[internalPath] || internalPath // Store the display name
    };
  } catch (error) {
    logger.error('Error finding weapon data:', error);
    throw error;
  }
}

// Get min/max range for a buff stat
export function getBuffRange(rivenType: string, tag: string, omegaAttenuation: number, lvl: number, buffs: number, curses: number): { min: number, max: number } {
  const minValue = getBuffValue(rivenType, tag, 0, omegaAttenuation, lvl, buffs, curses);
  const maxValue = getBuffValue(rivenType, tag, 1, omegaAttenuation, lvl, buffs, curses);
  
  return {
    min: minValue.displayValue,
    max: maxValue.displayValue
  };
}

// Get min/max range for a curse stat
export function getCurseRange(rivenType: string, tag: string, omegaAttenuation: number, lvl: number, buffs: number, curses: number): { min: number, max: number } {
  const minValue = getCurseValue(rivenType, tag, 0, omegaAttenuation, lvl, buffs, curses);
  const maxValue = getCurseValue(rivenType, tag, 1, omegaAttenuation, lvl, buffs, curses);
  
  // Some stats have reversed display values for curses
  const shouldReverse = reverseSymbolStats.includes(tag);
  const displayMin = shouldReverse ? minValue.displayValue * -1 : minValue.displayValue;
  const displayMax = shouldReverse ? maxValue.displayValue * -1 : maxValue.displayValue;
  
  return {
    min: displayMin,
    max: displayMax
  };
}

// Calculate buff value
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

// Calculate curse value
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

// Calculate where a value sits in a range (from 0 to 1)
export function calculateValueOnScale(value: number, min: number, max: number, isCurse: boolean = false): number {
  // For curses, we reverse the scale (a stronger curse is worse)
  if (min === max) return 0.5; // Avoid division by zero
  
  const range = max - min;
  const position = (value - min) / range;
  
  // For curses, we need to invert the scale
  return isCurse ? 1 - position : position;
}

// Convert a quality value to a letter grade
export function floatToGrade(qualityValue: number): string {
  // Convert the 0-1 quality value to a percentage difference from center (0-15 scale)
  // 0.5 is the center (B grade), which represents 0% difference from average
  // 0 or 1 represent maximum deviation from center (±15%)
  const percentDiff = Math.abs((qualityValue - 0.5) * 30);
  
  // Check for extremely high values (beyond normal grading scale)
  if (percentDiff > 11.5) return "???";
  
  // Use the exact ranges from the reference image
  if (percentDiff >= 9.5) return qualityValue >= 0.5 ? "S" : "F";
  if (percentDiff >= 7.5) return qualityValue >= 0.5 ? "A+" : "C-";
  if (percentDiff >= 5.5) return qualityValue >= 0.5 ? "A" : "C";
  if (percentDiff >= 3.5) return qualityValue >= 0.5 ? "A-" : "C+";
  if (percentDiff >= 1.5) return qualityValue >= 0.5 ? "B+" : "B-";
  return "B"; // The center value (±1.5% from exact center)
}

// Update the generateGradeImage function to remove any GIF functionality and just use PNG
async function generateGradeImage(stats: Array<{ name: string, value: number, grade: string, quality: number, isCurse: boolean }>) {
  const canvas = createCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Riven Grade Analysis', canvas.width / 2, 60);
  
  // Draw grade table
  drawGradeTable(ctx, canvas.width / 2 - 200, 100);
  
  // Draw stat grades
  const startY = 280;
  const lineHeight = 80;
  
  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    const yPos = startY + (i * lineHeight);
    
    // Stat name and value
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${stat.name}: ${stat.value > 0 ? '+' : ''}${stat.value}%`, 100, yPos);
    
    // Calculate percentage difference from center for display
    const percentDiff = Math.abs((stat.quality - 0.5) * 30);
    const plusMinus = stat.isCurse ? 
      (stat.quality < 0.5 ? '+' : '-') : // For curses, lower quality means higher % (better curse)
      (stat.quality > 0.5 ? '+' : '-');  // For buffs, higher quality means higher % (better buff)
    
    // Only show + sign if there's an actual difference
    const displaySign = percentDiff > 1.5 ? plusMinus : '';
    
    // Grade with percentage
    const gradeColor = getGradeColor(stat.grade, stat.isCurse);
    ctx.fillStyle = gradeColor;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${stat.grade} (${displaySign}${percentDiff.toFixed(1)}%)`, canvas.width - 100, yPos);
  }
  
  return canvas.toBuffer();
}

// Draw the grade table shown in the image
function drawGradeTable(ctx: any, x: number, y: number) {
  const grades = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'F'];
  const ranges = ['9.5-11.5', '7.5-9.5', '5.5-7.5', '3.5-5.5', '1.5-3.5', '±1.5', '1.5-3.5', '3.5-5.5', '5.5-7.5', '7.5-9.5', '9.5-11.5'];
  
  // Table width and positioning
  const tableWidth = 400;
  const colWidth = tableWidth / 2;
  const rowHeight = 30;
  const tableX = x;  // Center the table
  
  // Save current text alignment
  const originalTextAlign = ctx.textAlign;
  
  // Draw "Percentage Difference" label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Percentage Difference from Average', tableX + colWidth, y - 30);
  
  // Draw "Positive" label
  ctx.fillStyle = '#00ff00';
  ctx.fillText('Better', tableX + colWidth / 2, y - 10);
  
  // Draw "Negative" label
  ctx.fillStyle = '#ff0000';
  ctx.fillText('Worse', tableX + colWidth + colWidth / 2, y - 10);
  
  // Draw the table
  for (let i = 0; i < grades.length; i++) {
    const grade = grades[i];
    const range = ranges[i];
    const yPos = y + i * rowHeight;
    
    // Middle grade has a different background
    if (grade === 'B') {
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(tableX, yPos, tableWidth, rowHeight);
    }
    
    // Set color based on grade
    ctx.fillStyle = getGradeColor(grade, false);
    
    // Draw left side (positive)
    if (i <= 5) {  // S to B
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(grade, tableX + colWidth / 4, yPos + rowHeight * 0.7);
      
      ctx.font = '16px Arial';
      ctx.fillText(range, tableX + colWidth * 3/4, yPos + rowHeight * 0.7);
    }
    
    // Set color based on grade, but for curses
    ctx.fillStyle = getGradeColor(grade, true);
    
    // Draw right side (negative)
    if (i >= 5) {  // B to F
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(grade, tableX + colWidth + colWidth / 4, yPos + rowHeight * 0.7);
      
      ctx.font = '16px Arial';
      ctx.fillText(range, tableX + colWidth + colWidth * 3/4, yPos + rowHeight * 0.7);
    }
  }
  
  // Restore original text alignment
  ctx.textAlign = originalTextAlign;
}

// Get color for a grade
function getGradeColor(grade: string, isCurse: boolean): string {
  // For positive stats: green is good (S), yellow is average (B), red is bad (F)
  // For negative stats: red is good (F - weak curse), yellow is average (B), green is bad (S - strong curse)
  if (!isCurse) {
    switch (grade) {
      case 'S': case 'A+': case 'A': case 'A-': return '#00ff00'; // Green
      case 'B+': case 'B': case 'B-': return '#ffff00'; // Yellow
      case 'C+': case 'C': case 'C-': case 'F': case '???': return '#ff0000'; // Red
      default: return '#ffffff'; // White for unknown
    }
  } else {
    switch (grade) {
      case 'S': case 'A+': case 'A': case 'A-': case '???': return '#ff0000'; // Red (strong curse is bad)
      case 'B+': case 'B': case 'B-': return '#ffff00'; // Yellow
      case 'C+': case 'C': case 'C-': case 'F': return '#00ff00'; // Green (weak curse is good)
      default: return '#ffffff'; // White for unknown
    }
  }
}

// Linear interpolation function
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Debug function to show the calculation process for a stat
export function debugRivenCalculation(
  tag: string,
  displayValue: number,
  rivenType: string,
  omegaAttenuation: number,
  lvl: number,
  buffCount: number,
  curseCount: number,
  isCurse: boolean
): { grade: string, rollQuality: number } {
  try {
    // Calculate the range for this stat
    const range = isCurse
      ? getCurseRange(rivenType, tag, omegaAttenuation, lvl, buffCount, curseCount)
      : getBuffRange(rivenType, tag, omegaAttenuation, lvl, buffCount, curseCount);
    
    // Check if this is a raw value stat (like Punch Through, Range)
    const isRawValueStat = rawValueStats.includes(tag);
    
    // For raw value stats, multiply by 100 for comparison with ranges
    const valueForCalculation = isRawValueStat ? displayValue * 100 : displayValue;
    
    // Log for debugging
    if (isRawValueStat) {
      logger.info(`[DETAILED_DEBUG] Is Raw Value Stat: true`);
      logger.info(`[DETAILED_DEBUG] Raw Value Calculation: Value for calculation = ${valueForCalculation} (original: ${displayValue})`);
      logger.info(`[DETAILED_DEBUG] Range: ${range.min} to ${range.max}`);
      logger.info(`[DETAILED_DEBUG] Center: ${(range.min + range.max) / 2}`);
    } else {
      logger.info(`[DETAILED_DEBUG] Is Raw Value Stat: false`);
    }
    
    // Calculate where this value falls in the range
    const quality = calculateValueOnScale(valueForCalculation, range.min, range.max, isCurse);
    
    // Convert to a grade
    const grade = floatToGrade(quality);
    
    // Add direct grade calculation for diagnostics
    logger.info(`[DETAILED_DEBUG] Direct Grade: ${grade}`);
    logger.info(`[DETAILED_DEBUG] Visualization Quality: ${quality.toFixed(5)} (0-1 scale)`);
    
    return { grade, rollQuality: quality };
  } catch (error) {
    logger.error(`Error in debugRivenCalculation for tag=${tag}, displayValue=${displayValue}:`, error);
    throw error;
  }
}

// Update this function to format faction damage as "x0.8" format and raw values correctly
export function formatStatValue(statName: string, statValue: number): string {
  // Handle raw values
  if (rawValueStats.includes(statName)) {
    return `+${statValue.toFixed(1)}`;
  }
  
  // Handle faction damage
  if (statName.toLowerCase().includes('damage to')) {
    // Convert -0.2 to x0.8 format
    const multiplier = 1.0 + statValue;
    return `x${multiplier.toFixed(2)}`;
  }
  
  // Special case for slide attack crit chance
  if (statName === "SlideAttackCritChanceMod") {
    return `${statValue > 0 ? "+" : ""}${statValue.toFixed(1)}%`;
  }
  
  // Default formatting
  return `${statValue > 0 ? "+" : ""}${statValue.toFixed(1)}%`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rivengrade')
    .setDescription('Calculates the grade for a Riven mod based on its stats')
    .addStringOption(option => 
      option.setName('weapon')
        .setDescription('The weapon name')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('rank')
        .setDescription('The riven rank (0-8)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(8))
    .addIntegerOption(option =>
      option.setName('buffs')
        .setDescription('Number of positive stats')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(4))
    .addIntegerOption(option =>
      option.setName('curses')
        .setDescription('Number of negative stats')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(2))
    .addStringOption(option => 
      option.setName('stat1_name')
        .setDescription('First stat name')
        .setRequired(true))
    .addNumberOption(option => 
      option.setName('stat1_value')
        .setDescription('First stat value (with sign)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('stat2_name')
        .setDescription('Second stat name')
        .setRequired(false))
    .addNumberOption(option => 
      option.setName('stat2_value')
        .setDescription('Second stat value (with sign)')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('stat3_name')
        .setDescription('Third stat name')
        .setRequired(false))
    .addNumberOption(option => 
      option.setName('stat3_value')
        .setDescription('Third stat value (with sign)')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('stat4_name')
        .setDescription('Fourth stat name')
        .setRequired(false))
    .addNumberOption(option => 
      option.setName('stat4_value')
        .setDescription('Fourth stat value (with sign)')
        .setRequired(false)) as SlashCommandBuilder,
  
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      // Get user inputs
      const weaponName = interaction.options.getString('weapon', true);
      const rank = interaction.options.getInteger('rank', true);
      const buffs = interaction.options.getInteger('buffs', true);
      const curses = interaction.options.getInteger('curses', true);
      
      // Validate total stats
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
      
      // Get the stats
      const stats: Array<{ name: string, value: number }> = [];
      
      // Get stat1
      const stat1Name = interaction.options.getString('stat1_name', true);
      const stat1Value = interaction.options.getNumber('stat1_value', true);
      stats.push({ name: stat1Name, value: stat1Value });
      
      // Get stat2 if provided
      const stat2Name = interaction.options.getString('stat2_name');
      const stat2Value = interaction.options.getNumber('stat2_value');
      if (stat2Name && stat2Value !== null) {
        stats.push({ name: stat2Name, value: stat2Value });
      }
      
      // Get stat3 if provided
      const stat3Name = interaction.options.getString('stat3_name');
      const stat3Value = interaction.options.getNumber('stat3_value');
      if (stat3Name && stat3Value !== null) {
        stats.push({ name: stat3Name, value: stat3Value });
      }
      
      // Get stat4 if provided
      const stat4Name = interaction.options.getString('stat4_name');
      const stat4Value = interaction.options.getNumber('stat4_value');
      if (stat4Name && stat4Value !== null) {
        stats.push({ name: stat4Name, value: stat4Value });
      }
      
      // Verify we have the right number of stats
      if (stats.length !== totalStats) {
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'Stat Count Mismatch',
          description: `You specified ${buffs} positive and ${curses} negative stats (total: ${totalStats}), but provided ${stats.length} stat values.`,
          timestamp: true
        });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Get weapon data
      const weaponsPath = path.join(process.cwd(), 'dict', 'ExportWeapons.json');
      const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      
      let ExportWeapons: Record<string, any> = {};
      let dict: Record<string, string> = {};
      try {
        const weaponsData = fs.readFileSync(weaponsPath, 'utf8');
        const dictData = fs.readFileSync(dictPath, 'utf8');
        ExportWeapons = JSON.parse(weaponsData);
        dict = JSON.parse(dictData);
      } catch (fileError) {
        logger.error('Error reading weapon/dictionary files:', fileError);
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Failed to load weapon data. Please try again later.',
          timestamp: true
        });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      const weaponInfo = findWeapon(weaponName, ExportWeapons, dict);
      
      if (!weaponInfo) {
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'Weapon Not Found',
          description: `Could not find weapon: ${weaponName}`,
          timestamp: true
        });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Process each stat
      const processedStats: Array<{ 
        name: string, 
        value: number, 
        grade: string, 
        quality: number,
        isCurse: boolean,
        range: { min: number, max: number } 
      }> = [];
      
      let totalQuality = 0;
      let validStats = 0;
      
      for (const stat of stats) {
        // Find the corresponding tag
        const tagName = findTagForStatName(stat.name);
        
        if (tagName === 'unknown') {
          logger.warn(`Unknown stat name: ${stat.name}`);
          processedStats.push({
            name: stat.name,
            value: stat.value,
            grade: 'N/A',
            quality: 0,
            isCurse: stat.value < 0,
            range: { min: 0, max: 0 }
          });
          continue;
        }
        
        // Special case for recoil: negative is actually good
        const isRecoil = tagName === "WeaponRecoilReductionMod" || 
                         stat.name.toLowerCase().includes('recoil');
        
        // Check if this is a raw value stat (like Punch Through or Range)
        const isRawValueStat = rawValueStats.includes(tagName);
        
        // For normal processing flow, determine if it's a curse based on the sign
        let isCurse = stat.value < 0;
        let valueToUse = stat.value;
        
        // For raw value stats, we need to multiply by 100 for comparison with ranges
        if (isRawValueStat) {
          valueToUse = stat.value * 100;
        }
        
        if (isRecoil) {
          // For recoil, we need to invert the logic completely
          // Negative recoil is good (reduces recoil) = a buff
          // Positive recoil is bad (increases recoil) = a curse
          isCurse = stat.value > 0; // Opposite of normal stats
          
          // Don't flip the value here - we'll handle range comparison properly below
        }
        
        // Get the range for this stat
        const range = isCurse
          ? getCurseRange(weaponInfo.rivenType, tagName, weaponInfo.omegaAttenuation, rank, buffs, curses)
          : getBuffRange(weaponInfo.rivenType, tagName, weaponInfo.omegaAttenuation, rank, buffs, curses);
        
        // Calculate where this value falls in the range
        let quality;
        
        if (isRecoil) {
          // For recoil, the range is inverted:
          // -95% to -115% (more negative = better reduction)
          // We need to invert the calculation for proper scaling
          
          // For recoil, stronger negative values are better
          // e.g., -115% is better than -95%
          // So we need to invert the standard scale
          if (isCurse) {
            // For positive recoil (curse), higher is worse
            quality = 1 - calculateValueOnScale(valueToUse, range.min, range.max, true);
          } else {
            // For negative recoil (buff), more negative is better
            // This means a value closer to the min is actually worse
            quality = calculateValueOnScale(Math.abs(valueToUse), Math.abs(range.max), Math.abs(range.min), false);
          }
        } else {
          // Normal calculation for non-recoil stats
          quality = calculateValueOnScale(valueToUse, range.min, range.max, isCurse);
        }
        
        // Convert to a grade
        const grade = floatToGrade(quality);
        
        processedStats.push({
          name: stat.name,
          value: stat.value, // Keep original value for display
          grade,
          quality,
          isCurse,
          range
        });
        
        // Add to total for overall grade (for curses, a lower value is better)
        const qualityForOverall = isCurse ? (1 - quality) : quality;
        totalQuality += qualityForOverall;
        validStats++;
      }
      
      // Calculate overall grade
      let overallGrade = 'N/A';
      let overallQuality = 0;
      
      if (validStats > 0) {
        overallQuality = totalQuality / validStats;
        overallGrade = floatToGrade(overallQuality);
      }
      
      // Use proper display name for the title
      const displayName = weaponInfo.displayName || weaponName;
      
      // Create result embed
      const embed = createEmbed({
        type: 'info',
        title: `Riven Grade: ${displayName}`,
        description: `Disposition: ${weaponInfo.omegaAttenuation.toFixed(2)}x | Rank: ${rank}/8 | Buffs: ${buffs} | Curses: ${curses}`,
        timestamp: true
      });
      
      // Add fields for each stat
      for (const stat of processedStats) {
        let fieldValue = `Grade: **${stat.grade}**`;
        
        if (stat.grade !== 'N/A') {
          fieldValue += ` (${Math.round(stat.quality * 100)}%)\n`;
          fieldValue += `Range: ${stat.range.min.toFixed(2)} to ${stat.range.max.toFixed(2)}`;
        }
        
        // Format the stat value appropriately using our formatting function
        const displayValue = formatStatValue(stat.name, stat.value);
        
        embed.addFields({
          name: `${displayValue} ${stat.name}`,
          value: fieldValue,
          inline: false
        });
      }
      
      // Add overall grade
      embed.addFields({
        name: 'Overall Grade',
        value: `**${overallGrade}** (${Math.round(overallQuality * 100)}%)`,
        inline: false
      });
      
      // Generate grade image
      try {
        const imageBuffer = await generateGradeImage(processedStats);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'riven-grade.png' });
        
        // Send the result
        await interaction.editReply({
          embeds: [embed],
          files: [attachment]
        });
      } catch (imageError) {
        logger.error('Error generating grade image:', imageError);
        // Send embed without image if there's an error
        await interaction.editReply({ embeds: [embed] });
      }
      
    } catch (error) {
      logger.error('Error in rivengrade command:', error);
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

module.exports = command;
module.exports.findWeapon = findWeapon;
module.exports.findTagForStatName = findTagForStatName;
module.exports.formatRivenType = formatRivenType;
module.exports.getBuffRange = getBuffRange;
module.exports.getCurseRange = getCurseRange;
module.exports.calculateValueOnScale = calculateValueOnScale;
module.exports.floatToGrade = floatToGrade;
module.exports.debugRivenCalculation = debugRivenCalculation; 