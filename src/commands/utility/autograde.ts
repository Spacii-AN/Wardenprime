import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ButtonBuilder,
  ButtonStyle,
  SelectMenuBuilder,
  SelectMenuOptionBuilder
} from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import * as util from 'util';
import * as stream from 'stream';
import * as os from 'os';
import sharp from 'sharp';
import FormData from 'form-data';
import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D, CanvasGradient } from 'canvas';
import { tryDetectAndCropRiven } from '../../utils/rivenImageProcessor';

//hi
// Try to register Helvetica Neue font if available
try {
  const fontPath = 'assets/HelveticaNeue.ttf';
  
  if (fsSync.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'Helvetica Neue' });
    logger.info(`Registered Helvetica Neue font from ${fontPath}`);
  } else {
    logger.warn(`Helvetica Neue font not found at ${fontPath}`);
  }
} catch (error) {
  logger.warn('Could not register Helvetica Neue font:', error);
}

// Import helper functions from rivengrade.ts using require() for CommonJS compatibility
const rivengradeHelpers = require('./rivengrade');
// Log the structure of the imported module
logger.debug('Imported rivengradeHelpers structure:', Object.keys(rivengradeHelpers));
try {
    logger.debug('rivengradeHelpers content sample:', JSON.stringify(rivengradeHelpers, null, 2).substring(0, 500));
} catch (e) { logger.warn('Could not stringify rivengradeHelpers'); }

const {
  findWeapon,
  unparseBuff,
  unparseCurse,
  floatToGrade,
  findTagForStatName,
  formatRivenType,
  displayValueToValue,
  lerp,
  debugRivenCalculation,
  calculateValueOnScale,
  getBuffRange,
  getCurseRange
} = rivengradeHelpers;

// Import WeaponMapEntry interface
interface WeaponMapEntry {
  name: string;
  internalPath: string;
  category: string;
  disposition: number;
  rivenType: string;
}

const pipeline = util.promisify(stream.pipeline);

// Define interface for processed stat
interface ProcessedStat {
  name: string;
  value: number;
  grade: string;
  rollQuality: number;
  percentDiff?: number; // Optional to maintain compatibility
}

// Constants for Tesseract OCR Engine modes
// const OEM_LSTM_ONLY = 1; // Remove this line as we're not using Tesseract anymore

// Define the command logic
const autogradeCommandExecute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  await interaction.deferReply();

  const tempFiles: string[] = []; // Keep track of temp files to delete

  try {
    const attachment = interaction.options.getAttachment('image');
    
    if (!attachment) {
      await interaction.editReply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'Image Required',
            description: 'Please upload an image of your riven mod.',
            timestamp: true
          })
        ]
      });
      return;
    }

    if (!attachment.contentType?.startsWith('image/')) {
      await interaction.editReply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'Invalid File Type',
            description: 'The uploaded file must be an image (JPG, PNG, etc.).',
            timestamp: true
          })
        ]
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'info',
          title: 'Processing Riven Image',
          description: 'Downloading and preparing image... This may take a few seconds...',
          timestamp: true
        })
      ]
    });

    // Download the image
    const imageUrl = attachment.url;
    const originalTempFilePath = path.join(os.tmpdir(), `riven-${Date.now()}-original.${attachment.contentType.split('/')[1]}`);
    tempFiles.push(originalTempFilePath);
    
    try {
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream'
      });

      const writeStream = fsSync.createWriteStream(originalTempFilePath);
      await pipeline(response.data, writeStream);
    } catch (error) {
      logger.error('Error downloading image:', error);
      await interaction.editReply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'Download Failed',
            description: 'Failed to download the riven image. Please try again.',
            timestamp: true
          })
        ]
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'info',
          title: 'Processing Riven Image',
          description: 'Cropping image and extracting text...',
          timestamp: true
        })
      ]
    });
    
    // --- Cropping and OCR Logic --- 
    let parsedData: { weaponName: string, stats: Array<{ name: string, value: number }>, rank: number } | null = null;
    let ocrError: Error | null = null; // Variable to store error from the try block

    try {
      // First, attempt to detect and crop the riven card from the image
      logger.info('Attempting to detect and crop riven card from image');
      const detectedRivenPath = await tryDetectAndCropRiven(originalTempFilePath);
      
      // Log the success or failure of the crop operation
      if (detectedRivenPath !== originalTempFilePath) {
        tempFiles.push(detectedRivenPath);
        logger.info(`Successfully detected and cropped riven card to ${detectedRivenPath}`);
        
        // Log file information
        try {
          const fileStats = fsSync.statSync(detectedRivenPath);
          logger.info(`Cropped file stats: size=${fileStats.size} bytes, mode=${fileStats.mode.toString(8)}`);
        } catch (statsErr) {
          logger.warn(`Failed to get file stats for cropped image: ${statsErr}`);
        }
      } else {
        logger.info('Could not detect riven card, proceeding with original image');
      }
      
      // First attempt: standard resize with moderate quality
      let resizedTempFilePath = path.join(os.tmpdir(), `riven-${Date.now()}-resized.jpg`);
      tempFiles.push(resizedTempFilePath);
      
      logger.info(`Resizing image to ${resizedTempFilePath}`);
      try {
        await sharp(detectedRivenPath)
          .resize({ width: 1000, height: 1000, fit: 'inside' })
          .jpeg({ quality: 85 })
          .toFile(resizedTempFilePath);
          
        logger.info(`Image resized successfully to ${resizedTempFilePath}`);
      } catch (resizeErr) {
        logger.error(`Error during image resize: ${resizeErr}`);
        logger.error(`Resize error details: ${resizeErr instanceof Error ? resizeErr.stack : 'No stack trace'}`);
        
        // Log both input and output files to diagnose "Cannot use same file" error
        logger.info(`Resize input file: ${detectedRivenPath}, output file: ${resizedTempFilePath}`);
        logger.info(`Are input and output the same file? ${detectedRivenPath === resizedTempFilePath}`);
        
        throw resizeErr; // Rethrow to be caught by the outer try-catch
      }
      
      // Check if file is under 1024KB
      let fileStats = fsSync.statSync(resizedTempFilePath);
      let sizeKB = fileStats.size / 1024;
      logger.info(`First resize attempt: ${sizeKB.toFixed(2)} KB`);
      
      // Progressive compression if needed
      if (sizeKB >= 1000) {
        logger.info(`Image too large (${sizeKB.toFixed(2)} KB), applying progressive compression...`);
        
        // Try progressive compression up to 3 times
        for (let i = 1; i <= 3; i++) {
          if (sizeKB < 1000) break; // Skip if already small enough
          
          const nextTempFilePath = path.join(os.tmpdir(), `riven-${Date.now()}-comp${i}.jpg`);
          tempFiles.push(nextTempFilePath);
          
          logger.info(`Compression attempt #${i}: Input=${resizedTempFilePath}, Output=${nextTempFilePath}`);
          
          try {
            // Each attempt uses stronger compression
            await sharp(resizedTempFilePath)
              .resize({ width: 1000 - (i * 200), height: 1000 - (i * 200), fit: 'inside' })
              .jpeg({ quality: 85 - (i * 15) })
              .toFile(nextTempFilePath);
              
            // Update variables for next iteration
            resizedTempFilePath = nextTempFilePath;
            fileStats = fsSync.statSync(resizedTempFilePath);
            sizeKB = fileStats.size / 1024;
            logger.info(`Compression attempt #${i} result: ${sizeKB.toFixed(2)} KB`);
          } catch (compErr) {
            logger.error(`Error during compression attempt #${i}: ${compErr}`);
            throw compErr;
          }
        }
        
        // Final size check
        if (sizeKB >= 1024) {
          logger.warn(`Unable to compress image below 1024KB limit (current: ${sizeKB.toFixed(2)} KB)`);
          throw new Error('Image too large for OCR API even after compression');
        }
      }
      
      logger.info(`Final image for OCR: ${resizedTempFilePath} (${sizeKB.toFixed(2)} KB)`);

      // Use OCR.space API
      const OCR_API_KEY = process.env.OCR_API_KEY;
      
      // Create form data for OCR.space API
      const formData = new FormData();
      formData.append('file', fsSync.createReadStream(resizedTempFilePath), { filename: 'riven.jpg' });
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('OCREngine', '2'); // Use OCR engine 2 for better quality
      formData.append('scale', 'true');
      formData.append('detectOrientation', 'true');
      
      logger.info('Sending OCR request to OCR.space API...');
      logger.debug('OCR request params: language=eng, engine=2, scale=true, detectOrientation=true');
      
      // Define the PRO tier endpoints
      const OCR_API_ENDPOINTS = [
        'https://apipro1.ocr.space/parse/image', // Datacenter #1
        'https://apipro2.ocr.space/parse/image'  // Datacenter #2
      ];
      
      // Send request to OCR.space API and time the response
      const startTime = Date.now();
      let ocrResponse;
      let apiError;
      
      // Try each endpoint with failover
      for (let i = 0; i < OCR_API_ENDPOINTS.length; i++) {
        const endpoint = OCR_API_ENDPOINTS[i];
        try {
          logger.info(`Sending OCR request to endpoint #${i+1}: ${endpoint}`);
          ocrResponse = await axios.post(endpoint, formData, {
            headers: {
              ...formData.getHeaders(),
              'apikey': OCR_API_KEY
            }
          });
          const responseTime = Date.now() - startTime;
          logger.info(`OCR API responded in ${responseTime}ms with status ${ocrResponse.status}`);
          // If we got a successful response, break the loop
          break;
        } catch (err) {
          apiError = err;
          logger.error(`OCR API error with endpoint #${i+1} after ${Date.now() - startTime}ms:`, err);
          
          // Detailed error information
          if (axios.isAxiosError(err)) {
            if (err.response) {
              logger.error(`OCR API response error: status=${err.response.status}, data=${JSON.stringify(err.response.data)}`);
            } else if (err.request) {
              logger.error('OCR API request was made but no response received');
            } else {
              logger.error(`OCR API request setup error: ${err.message}`);
            }
          }
          
          // Only continue to next endpoint if we have another one to try
          if (i < OCR_API_ENDPOINTS.length - 1) {
            logger.info(`Trying next OCR API endpoint #${i+2}`);
          }
        }
      }
      
      // After trying all endpoints, check if we need to throw an error
      if (!ocrResponse) {
        logger.error('All OCR API endpoints failed');
        throw apiError || new Error('Failed to connect to OCR service');
      }
      
      // Process OCR result
      if (!ocrResponse.data || !ocrResponse.data.ParsedResults || ocrResponse.data.ParsedResults.length === 0) {
        logger.warn('OCR API returned no results');
        
        // Log any error information provided by the API
        if (ocrResponse.data?.IsErroredOnProcessing) {
          logger.error(`OCR API processing error: ${ocrResponse.data.ErrorMessage || 'No error message'}`);
          logger.error(`OCR API error details: ${ocrResponse.data.ErrorDetails || 'No details'}`);
        }
        
        // Log the OCR response structure for debugging
        logger.debug(`OCR response structure: ${JSON.stringify({
          IsErroredOnProcessing: ocrResponse.data?.IsErroredOnProcessing,
          OCRExitCode: ocrResponse.data?.OCRExitCode,
          ProcessingTimeInMilliseconds: ocrResponse.data?.ProcessingTimeInMilliseconds,
          HasResults: ocrResponse.data?.ParsedResults && ocrResponse.data.ParsedResults.length > 0
        })}`);
        
        throw new Error('OCR service returned no results');
      }
      
      // Get text from OCR results
      const fullText = ocrResponse.data.ParsedResults[0].ParsedText?.trim() || '';
      
      // Log OCR processing information
      logger.info(`OCR API processing time: ${ocrResponse.data.ProcessingTimeInMilliseconds}ms`);
      logger.info(`OCR exit code: ${ocrResponse.data.OCRExitCode}`);
      logger.info(`OCR detected text length: ${fullText.length} characters`);
      
      // Log the complete raw OCR output
      logger.info(`[OCR_RAW] ===== COMPLETE RAW OCR TEXT =====`);
      logger.info(`[OCR_RAW] ${fullText}`);
      logger.info(`[OCR_RAW] ===== END RAW OCR TEXT =====`);
      
      // Split the text by lines
      const ocrLines = fullText.split('\n');
      logger.info(`OCR returned ${ocrLines.length} lines of text`);
      
      // Log each line separately for debugging
      ocrLines.forEach((line: string, index: number) => {
        logger.info(`[OCR_RAW] Line ${index}: "${line}"`);
      });
      
      // Look for slide attack crit chance specifically
      const slideAttackRegex = /slide\s+(attack\s+)?(crit(ical)?|cc)/i;
      ocrLines.forEach((line: string, index: number) => {
        if (slideAttackRegex.test(line)) {
          logger.info(`[OCR_SLIDE] FOUND potential slide attack line: "${line}"`);
          
          // Try to extract the value using a more specific regex
          const valueMatch = line.match(/([+-]?\d+(\.\d+)?)\s*%/);
          if (valueMatch) {
            logger.info(`[OCR_SLIDE] Extracted value: ${valueMatch[1]}%`);
          }
        }
      });
      
      // Exit early if OCR result is suspiciously short
      if (fullText.length < 20) {
        logger.warn(`OCR result suspiciously short (${fullText.length} chars): "${fullText}"`);
        await interaction.editReply({ content: 'The OCR result was too short or empty. Please upload a clearer image.' });
        return;
      }
      
      // Extract weapon name and stats from full text
      const lines = fullText.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
      logger.info(`OCR returned ${lines.length} lines of text`);
      
      // Find weapon name (typically found in first few lines of text)
      let rawWeaponName = '';
      let weaponLineIndex = -1;

      // First, look for lines that have common weapon names
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        
        // Skip lines that appear to be riven capacity values (number+letter format like "18V")
        if (i === 0 && /^\d+[A-Za-z]$/.test(line.trim())) {
          logger.info(`[Autograde] Skipping first line "${line}" - appears to be riven capacity`);
          continue;
        }
        
        if (KNOWN_BASE_WEAPONS.some(weapon => line.toLowerCase().includes(weapon.toLowerCase()))) {
          rawWeaponName = line;
          weaponLineIndex = i;
          logger.info(`[Autograde] Found weapon name in line ${i}: ${rawWeaponName}`);
          break;
        }
      }

      // If no match found, use first non-empty line as a fallback
      // BUT skip any line that looks like a riven capacity value (number+letter)
      if (!rawWeaponName && lines.length > 0) {
        for (let i = 0; i < Math.min(5, lines.length); i++) {
          // Skip lines that look like riven capacity ("18V")
          if (/^\d+[A-Za-z]$/.test(lines[i].trim())) {
            logger.info(`[Autograde] Skipping line ${i} "${lines[i]}" - appears to be riven capacity`);
            continue;
          }
          
          rawWeaponName = lines[i];
          weaponLineIndex = i;
          logger.info(`[Autograde] Using line ${i} as weapon name fallback: ${rawWeaponName}`);
          break;
        }
        
        // If we still have nothing, use the first line as absolute fallback
        if (!rawWeaponName && lines.length > 0) {
          rawWeaponName = lines[0];
          weaponLineIndex = 0;
          logger.info(`[Autograde] Using first line as absolute fallback: ${rawWeaponName}`);
        }
      }

      // Check if the next line might contain the rest of the riven name
      // Riven names often have suffix parts like "-acricron", "-magnacron", etc.
      if (weaponLineIndex >= 0 && weaponLineIndex + 1 < lines.length) {
        const nextLine = lines[weaponLineIndex + 1];
        // Only combine if next line is short and doesn't have % signs (not a stat line)
        if (nextLine.length < 20 && !nextLine.includes('%') && !nextLine.includes('RANK')) {
          rawWeaponName += ' ' + nextLine;
          logger.info(`Combined with next line: "${rawWeaponName}"`);
        }
      }
      
      // Clean weapon name: remove newlines, multiple spaces, and extract known name
      const cleanedRawName = rawWeaponName.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      logger.info(`Raw extracted weapon name: ${cleanedRawName}`);
      let weaponName = extractBestWeaponName(cleanedRawName); // Use helper function
      
      logger.info(`Cleaned weapon name: ${weaponName}`);
      
      // Find riven rank (look for X/8 pattern or MR X pattern)
      let rank = 8; // Default to max rank if not found
      for (const line of lines) {
        // Look for X/8 pattern
        const rankMatch = line.match(/(\d+)\s*\/\s*8/);
        if (rankMatch) {
          rank = parseInt(rankMatch[1], 10);
          logger.info(`Found riven rank: ${rank}/8`);
          break;
        }
        
        // Also look for MR X pattern which might indicate rank
        const mrMatch = line.match(/MR\s*(\d+)/i);
        if (mrMatch) {
          // This could be Mastery Rank requirement, but we'll use it as a fallback
          const possibleRank = parseInt(mrMatch[1], 10);
          if (possibleRank <= 8) {
            rank = possibleRank;
            logger.info(`Found possible riven rank from MR: ${rank}`);
          }
        }
      }

      // Find stats (lines with percentage signs)
      const statsLines = lines.filter((line: string) => line.includes('%'));
      logger.info(`[Alias] Found ${statsLines.length} potential stat lines with percentages: ${JSON.stringify(statsLines)}`);

      // Find "for Slide Attack" or similar lines
      const slideAttackLines = lines.filter((line: string) => 
        line.toLowerCase().includes('slide attack') || 
        line.toLowerCase().includes('for slide')
      );
      logger.info(`[Slide_Attack] Found ${slideAttackLines.length} potential slide attack lines: ${JSON.stringify(slideAttackLines)}`);
      
      // Special case for slide attack critical chance
      // Check if we have a "Critical Chance" stat with negative value and a "for Slide Attack" line
      const negativeCritIndex = statsLines.findIndex((line: string) => 
        line.includes('-') && line.toLowerCase().includes('critical chance')
      );
      
      if (negativeCritIndex !== -1 && slideAttackLines.length > 0) {
        // We have a negative crit chance and slide attack line - almost certainly slide attack crit chance
        logger.info(`[Slide_Attack] Found negative crit chance at index ${negativeCritIndex} and slide attack line`);
        
        // Modify the statsLines array to change the negative crit chance line
        const originalLine = statsLines[negativeCritIndex];
        statsLines[negativeCritIndex] = originalLine + ' for Slide Attack';
        logger.info(`[Slide_Attack] Modified stat line: "${originalLine}" → "${statsLines[negativeCritIndex]}"`);
      }

      // Find faction damage lines (lines with "x" followed by a number and "Damage to")
      const factionLines = lines.filter((line: string) => /x[\d.]+.*Damage to (Corpus|Grineer|Infested)/i.test(line));
      logger.info(`[Alias] Found ${factionLines.length} potential faction damage lines: ${JSON.stringify(factionLines)}`);

      // Find time-based stats (lines with seconds like "-8.7s Combo Duration")
      const timeBasedLines = lines.filter((line: string) => /[+-]?\d+\.?\d*s\s+\w+/i.test(line));
      logger.info(`[Autograde] Found ${timeBasedLines.length} potential time-based stat lines: ${JSON.stringify(timeBasedLines)}`);

      // Find lines that might be just percentage values without stat names
      const percentOnlyLines = lines.filter((line: string) => /^[+-]?\s*\d+\.?\d*\s*%\s*$/.test(line.trim()));
      logger.info(`[Autograde] Found ${percentOnlyLines.length} lines with just percentages: ${JSON.stringify(percentOnlyLines)}`);

      // Find numeric stats without percentage signs (like "+1.7 Range" or "+20.9 Initial Combo")
      const numericStatLines = lines.filter((line: string) => 
          /^[+-]\s*\d+\.?\d*\s+[A-Za-z]/.test(line.trim()) && // Pattern: +/- number followed by text
          !line.includes('%') && // Exclude percentage stats (already handled)
          !line.includes('s ') // Exclude time-based stats (already handled)
      );
      logger.info(`[Autograde] Found ${numericStatLines.length} potential numeric stats without percentage: ${JSON.stringify(numericStatLines)}`);

      const stats: Array<{ name: string, value: number }> = [];

      // Process percentage stats
      for (let i = 0; i < statsLines.length; i++) {
        const line = statsLines[i];
        const match = line.match(/(?:^|\s)([+-]\d+\.?\d*)\s*%+\s*(.+)/);
        if (match) {
          const value = parseFloat(match[1]);
          
          let originalName = match[2].trim();
          let name = originalName; // Start with original
          
          // Check if the next line might contain additional stat description (like "for Slide Attack")
          if (i < statsLines.length - 1 && name.toLowerCase().includes("critical chance")) {
            // Get the next line
            const nextLine = statsLines[i + 1];
            
            // If the next line doesn't have a percentage and might be a continuation
            if (!nextLine.match(/[+-]?\d+\.?\d*\s*%/) && 
                (nextLine.toLowerCase().includes("slide") || 
                 nextLine.toLowerCase().includes("for "))) {
              
              // This is likely a continuation of the current stat
              name += " " + nextLine.trim();
              logger.info(`[Stat_Combine] Combined stat lines: "${originalName}" + "${nextLine.trim()}" → "${name}"`);
              
              // Skip the next line since we've used it
              i++;
            }
          }
          
          // Also check if there's a non-stat line that could be a continuation
          // This handles cases where the line isn't in the statsLines array
          if (i + weaponLineIndex + 1 < lines.length && name.toLowerCase().includes("critical chance")) {
            const lineIdx = i + weaponLineIndex + 1;
            if (lineIdx < lines.length) {
              const potentialLine = lines[lineIdx].trim();
              
              // Check if this line mentions "slide attack" but isn't a stat line
              if (!potentialLine.match(/[+-]?\d+\.?\d*\s*%/) && 
                  (potentialLine.toLowerCase().includes("slide") || 
                   potentialLine.toLowerCase().includes("for "))) {
                
                // Combine with this line
                name += " " + potentialLine;
                logger.info(`[Stat_Combine] Found continuation line: "${originalName}" + "${potentialLine}" → "${name}"`);
              }
            }
          }
          
          // Special case handling for common elemental misreadings from OCR
          if (name.toLowerCase().match(/^a\s+heat$/i) || name.toLowerCase() === 'a heat') {
            // Special case for Heat with OCR misreading the icon as "A"
            name = 'heat';
            logger.info(`[Autograde] Found Heat with OCR misreading (A Heat), normalized to "heat"`);
          } else if (name.toLowerCase().match(/^a\s+cold$/i) || name.toLowerCase() === 'a cold') {
            // Special case for Cold with OCR misreading the icon
            name = 'cold';
            logger.info(`[Autograde] Found Cold with OCR misreading (A Cold), normalized to "cold"`);
          } else if (name.toLowerCase().match(/^a\s+electricity$/i) || name.toLowerCase() === 'a electricity') {
            // Special case for Electricity with OCR misreading the icon
            name = 'electricity';
            logger.info(`[Autograde] Found Electricity with OCR misreading (A Electricity), normalized to "electricity"`);
          } else if (name.toLowerCase().match(/^a\s+toxin$/i) || name.toLowerCase() === 'a toxin') {
            // Special case for Toxin with OCR misreading the icon
            name = 'toxin';
            logger.info(`[Autograde] Found Toxin with OCR misreading (A Toxin), normalized to "toxin"`);
          } else if (name.toLowerCase().includes('fire') && name.toLowerCase().includes('rate')) {
            name = 'fire rate'; // Immediately normalize Fire Rate
            logger.info(`[Autograde] Found Fire Rate pattern, normalized to "fire rate"`);
          } else if (name.toLowerCase().includes('critical') && name.toLowerCase().includes('damage')) {
            // Handle critical damage as a special case - DO NOT normalize to "damage"
            name = 'critical damage';
            logger.info(`[Autograde] Found Critical Damage pattern, normalized to "critical damage"`);
          } else {
            // If not a special case, apply general cleanup:
            // Remove both complete AND incomplete parentheses and everything within
            name = name.replace(/\s*\([^)]*\)?/g, '');
            // Remove other typical OCR artifacts and standardize 
            name = name.replace(/[^a-zA-Z\s-]+/g, ' ').trim();
            // Normalize spaces (no double spaces)
            name = name.replace(/\s+/g, ' ').trim();
            logger.info(`[Autograde] Applied general cleanup, result: "${name}"`);
          }
          
          // Specific detection for slide attack critical chance
          if (name.toLowerCase().includes('slide') && 
              (name.toLowerCase().includes('critical chance') || name.toLowerCase().includes('crit chance'))) {
            name = 'Critical Chance for Slide Attack';
            logger.info(`[SLIDE_CRIT] Detected and normalized to "Critical Chance for Slide Attack"`);
          }
          // Also check for critical chance with slide attack in separate parts
          else if (name.toLowerCase().includes('critical chance') && 
                   name.toLowerCase().includes('for slide')) {
            name = 'Critical Chance for Slide Attack';
            logger.info(`[SLIDE_CRIT] Found "Critical Chance for Slide" and normalized to "Critical Chance for Slide Attack"`);
          }
          // Final check - if this is a negative crit chance, AND we previously found a slide attack line,
          // assume this is slide attack crit chance
          else if (name.toLowerCase() === 'critical chance' && value < 0 && slideAttackLines.length > 0) {
            name = 'Critical Chance for Slide Attack';
            logger.info(`[SLIDE_CRIT] Negative Critical Chance with slide attack line found - treating as Critical Chance for Slide Attack`);
          }
          
          if (name && !isNaN(value)) {
            // CORRECTED LOGGING: Show the *final* name being pushed
            logger.info(`[Alias] Pushing cleaned stat: "${name}" = ${value}`);
            stats.push({ name, value });
          } else {
             logger.warn(`[Alias] Stat discarded after cleaning (invalid name or value): Original='${originalName}', Cleaned='${name}', Value=${value}`);
          }
        } else {
          logger.warn(`[Alias] Stat line regex did not match: "${line}"`);
        }
      }

      // Process numeric stats without percentage signs
      for (const line of numericStatLines) {
        // Extract the sign, numeric value, and stat name
        const match = line.match(/([+-])\s*(\d+\.?\d*)\s+(.+)/);
        if (match) {
          const sign = match[1]; // "+" or "-"
          const numericPart = match[2]; // The numeric part
          const value = parseFloat(sign + numericPart);
          let name = match[3].trim();
          
          // Clean up the name - same as for percentage stats
          name = name.replace(/\s*\([^)]*\)?/g, ''); // Remove parentheses and content
          name = name.replace(/[^a-zA-Z\s-]+/g, ' ').trim(); // Remove non-alphabetic chars
          name = name.replace(/\s+/g, ' ').trim(); // Normalize spaces
          
          logger.info(`[Autograde] Found numeric stat without percentage: "${name}" = ${value}`);
          
          if (name && !isNaN(value)) {
            logger.info(`[Autograde] Pushing numeric stat: "${name}" = ${value}`);
            stats.push({ name, value });
          } else {
            logger.warn(`[Autograde] Numeric stat discarded after cleaning: Original='${match[3]}', Cleaned='${name}', Value=${value}`);
          }
        } else {
          logger.warn(`[Autograde] Numeric stat regex did not match: "${line}"`);
        }
      }

      // Process faction damage stats
      for (const line of factionLines) {
        // Extract the multiplier and the faction
        const match = line.match(/x([\d.]+).*Damage to (Corpus|Grineer|Infested)/i);
        if (match) {
          const multiplier = parseFloat(match[1]);
          const faction = match[2];
          
          // FIXED: Pass the actual decimal value 
          // For example, x0.8 means -0.2 (not -20%)
          const decimalValue = -(1.0 - multiplier);
          
          const name = `Damage to ${faction}`;
          logger.info(`Found faction damage modifier: x${multiplier} = ${decimalValue.toFixed(2)} (decimal) to ${faction}`);
          
          if (!isNaN(decimalValue)) {
            logger.info(`Pushing faction damage: "${name}" = ${decimalValue}`);
            stats.push({ name, value: decimalValue });
          }
        } else {
          logger.warn(`Faction damage regex did not match: "${line}"`);
        }
      }
      
      // Process time-based stats (like combo duration)
      for (const line of timeBasedLines) {
        // Extract the value (with sign) and the stat name
        const match = line.match(/([+-]?\d+\.?\d*)s\s+(.+)/i);
        if (match) {
          const value = parseFloat(match[1]);
          let name = match[2].trim();
          
          // Clean up the name
          name = name.replace(/\s*\([^)]*\)?/g, ''); // Remove parentheses and content
          name = name.replace(/[^a-zA-Z\s-]+/g, ' ').trim(); // Remove non-alphabetic chars
          name = name.replace(/\s+/g, ' ').trim(); // Normalize spaces
          
          logger.info(`[Autograde] Found time-based stat: "${name}" = ${value}s`);
          
          if (name && !isNaN(value)) {
            // For time-based stats, convert to percentage format for consistent processing
            // For example, combo duration is internally treated as a percentage
            logger.info(`[Autograde] Pushing time-based stat as percentage: "${name}" = ${value}`);
            stats.push({ name, value });
          } else {
            logger.warn(`[Autograde] Time-based stat discarded after cleaning: Original='${match[2]}', Cleaned='${name}', Value=${value}`);
          }
        } else {
          logger.warn(`[Autograde] Time-based stat regex did not match: "${line}"`);
        }
      }
      
      // Special handling for stats that might be split across multiple lines
      for (const line of percentOnlyLines) {
        const lineIndex = lines.indexOf(line);
        if (lineIndex >= 0 && lineIndex + 1 < lines.length) {
          // Use a more flexible regex that properly handles space between sign and number
          const valueMatch = line.match(/([+-])\s*(\d+\.?\d*)\s*%/);
          const nextLine = lines[lineIndex + 1].trim();
          
          // Check if the next line looks like a stat name (and not another percentage or MR line)
          if (valueMatch && 
              !nextLine.includes('%') && 
              !nextLine.toLowerCase().includes('mr') &&
              nextLine.length > 0) {
            
            // Reconstruct the value including sign, ensuring no spaces between sign and number
            const sign = valueMatch[1]; // "+" or "-"
            const number = valueMatch[2]; // The numeric part
            const value = parseFloat(sign + number);
            
            logger.info(`[Autograde] Extracted split stat value: ${sign}${number} = ${value}`);
            
            let name = nextLine.replace(/^\/+/, '').trim(); // Remove leading slashes like "/Impact"
            
            // Clean up names similar to regular stats
            name = name.replace(/\s*\([^)]*\)?/g, ''); // Remove parentheses and content
            name = name.replace(/[^a-zA-Z\s-]+/g, ' ').trim(); // Remove non-alphabetic chars
            name = name.replace(/\s+/g, ' ').trim(); // Normalize spaces
            
            logger.info(`[Autograde] Found split stat: "${value}%" + "${name}" from lines ${lineIndex} and ${lineIndex+1}`);
            
            if (name && !isNaN(value)) {
              logger.info(`[Autograde] Pushing combined split stat: "${name}" = ${value}`);
              stats.push({ name, value });
            } else {
              logger.warn(`[Autograde] Split stat discarded after cleaning: Original='${nextLine}', Cleaned='${name}', Value=${value}`);
            }
          }
        }
      }
      
      // Only set parsedData if we have a weapon name and at least one stat
      if (weaponName && stats.length > 0) {
        parsedData = { weaponName, stats, rank };
        logger.info(`Successfully parsed riven with rank ${rank}/8`);
      } else {
        // Log the results *before* throwing the error
        logger.warn(`Parsing failed checks. Weapon: "${weaponName}", Stats Found: ${stats.length}`);
        throw new Error(`Parsing failed: Weapon name empty or no stats found.`);
      }

    } catch (ocrError) {
      logger.error('Error during OCR process:', ocrError);
      ocrError = ocrError instanceof Error ? ocrError : new Error(String(ocrError));
    }

    // --- Final Processing & Cleanup --- 

    if (!parsedData) { // Check if parsedData is still null
      logger.error('Failed to parse riven data after cropping/OCR attempt.', ocrError);
      await interaction.editReply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'Parsing Failed',
            description: `Could not parse riven data from the image. Please ensure the image is clear and well-lit.\n${ocrError ? `Error: ${ocrError.message}` : 'Unknown parsing error.'}`,
            timestamp: true
          })
        ]
      });
    } else {
      // Process the successfully parsed data and create an embed
      
      // *** RE-VERIFIED LOGGING *** Ensure this log is present
      logger.info(`[Autograde] Final stats array before calling processRivenData: ${JSON.stringify(parsedData.stats)}`);
      
      const { embed, attachmentPath, variantOptions } = await processRivenData(parsedData, imageUrl, tempFiles);
      
      // Create message components if there are variant options
      const components = [];
      
      if (variantOptions && variantOptions.length > 1) {
        // Create select menu for weapon variants
        const select = new StringSelectMenuBuilder()
          .setCustomId('variant_select')
          .setPlaceholder('Select weapon variant to grade by...');
          
        // Add options for each variant
        variantOptions.forEach(variant => {
          select.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(variant.name)
              .setDescription(`Disposition: ${variant.disposition.toFixed(2)}x`)
              .setValue(variant.name)
          );
        });
        
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
        components.push(row);
      }
      
      // If we have an attachment path, create an attachment
      if (attachmentPath) {
        const isGif = attachmentPath.endsWith('.gif');
        const attachmentName = isGif ? 'riven-grade.gif' : 'riven-grade.png';
        logger.info(`[GIF DEBUG] Creating attachment: path=${attachmentPath}, detected as GIF=${isGif}, using name=${attachmentName}`);
        const attachment = new AttachmentBuilder(attachmentPath, { name: attachmentName });
        
        if (isGif) {
          // When it's a GIF, send the embed first, then the GIF separately to ensure animation works
          const message = await interaction.editReply({ 
            embeds: [embed], 
            components: components
          });
          await interaction.followUp({ files: [attachment], content: '**Animated Riven Grade:**' });
          
          // Add collector for variant selection dropdown
          if (components.length > 0) {
            setupVariantCollector(message, parsedData, imageUrl, tempFiles);
          }
        } else {
          // For PNGs, include the image in the embed as before
          const message = await interaction.editReply({ 
            embeds: [embed], 
            files: [attachment], 
            components: components 
          });
          
          // Add collector for variant selection dropdown
          if (components.length > 0) {
            setupVariantCollector(message, parsedData, imageUrl, tempFiles);
          }
        }
      } else {
        const message = await interaction.editReply({ 
          embeds: [embed], 
          components: components 
        });
        
        // Add collector for variant selection dropdown
        if (components.length > 0) {
          setupVariantCollector(message, parsedData, imageUrl, tempFiles);
        }
      }
    }

  } catch (error) {
    logger.error('Error executing autograde command:', error);
    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'error',
          title: 'Command Error',
          description: 'An unexpected error occurred while processing the command.',
          timestamp: true
        })
      ]
    });
  } finally {
    // Clean up all temporary files
    logger.info(`Cleaning up temporary files: ${tempFiles.join(', ')}`);
    for (const file of tempFiles) {
      try {
        if (fsSync.existsSync(file)) {
          await fs.unlink(file);
        }
      } catch (unlinkError) {
        logger.error(`Error deleting temporary file ${file}:`, unlinkError);
      }
    }
  }
};

// Define the data for the command
const autogradeCommandData = new SlashCommandBuilder()
  .setName('autograde')
  .setDescription('Auto-grades a riven from an uploaded image')
  .addAttachmentOption(option => 
    option.setName('image')
      .setDescription('Image of the riven to grade')
      .setRequired(true));

// --- Helper Function for Weapon Name Extraction --- 
// Load weapon names from weaponLookup.json instead of hard-coding them
let KNOWN_BASE_WEAPONS: string[] = [];

// Load weapon names from weaponLookup.json at startup
async function loadKnownWeapons(): Promise<void> {
  try {
    const weaponLookupPath = path.join(process.cwd(), 'dict', 'weaponLookup.json');
    if (fsSync.existsSync(weaponLookupPath)) {
      const data = await fs.readFile(weaponLookupPath, 'utf8');
      const weaponLookup = JSON.parse(data);
      
      // Extract weapon names from the lookup - weaponLookup is an object where:
      // - keys are weapon names (lowercase)
      // - values are arrays of weapon data objects
      // For our purposes, we just need the keys, properly capitalized
      KNOWN_BASE_WEAPONS = Object.keys(weaponLookup).map(key => {
        // Capitalize the first letter of each word for better display
        return key.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      });
      
      logger.info(`Loaded ${KNOWN_BASE_WEAPONS.length} weapon names from weaponLookup.json`);
    } else {
      logger.warn(`weaponLookup.json not found at ${weaponLookupPath}`);
      // Fallback to a minimal set of common weapons in case the file isn't found
      KNOWN_BASE_WEAPONS = [
        'Broken Scepter', 'Braton', 'Soma', 'Paris', 'Tigris', 'Rubico'
      ];
      logger.warn(`Using fallback weapon list with ${KNOWN_BASE_WEAPONS.length} entries`);
    }
  } catch (error) {
    logger.error('Error loading weaponLookup.json:', error);
    // Fallback to a minimal set if there's an error
    KNOWN_BASE_WEAPONS = [
      'Broken Scepter', 'Braton', 'Soma', 'Paris', 'Tigris', 'Rubico'
    ];
    logger.warn(`Using fallback weapon list with ${KNOWN_BASE_WEAPONS.length} entries due to error`);
  }
}

// Call the function to load weapons at module initialization
loadKnownWeapons().catch(err => logger.error('Failed to initialize weapon list:', err));

function extractBestWeaponName(ocrText: string): string {
  if (!ocrText) return 'Unknown Weapon';
  
  logger.info(`[Autograde] Running weapon name extraction on: "${ocrText}"`);
  
  let bestMatch = '';
  const lowerText = ocrText.toLowerCase();
  
  // First approach: Look for complete known weapon names within the text
  // Use space padding for more accurate word boundary matching
  const paddedLowerText = ` ${lowerText} `;
  
  for (const baseWeapon of KNOWN_BASE_WEAPONS) {
    const paddedLowerWeapon = ` ${baseWeapon.toLowerCase()} `;
    
    // Check for exact word/phrase match with space boundaries
    if (paddedLowerText.includes(paddedLowerWeapon)) {
      if (baseWeapon.length > bestMatch.length) {
        bestMatch = baseWeapon;
        logger.info(`[Autograde] Found exact space-bounded match: "${baseWeapon}" in text`);
      }
    }
    // Also try without space padding in case it's at beginning/end
    else if (lowerText.includes(baseWeapon.toLowerCase())) {
      if (baseWeapon.length > bestMatch.length) {
        bestMatch = baseWeapon;
        logger.info(`[Autograde] Found substring match: "${baseWeapon}" in text`);
      }
    }
  }
  
  // If we found a match through the direct substring approach, return it
  if (bestMatch) {
    logger.info(`[Autograde] Using substring match: "${bestMatch}"`);
    return bestMatch;
  }
  
  // Second approach: Try word-by-word matching for multi-word weapons
  const words = lowerText.split(/\s+/);
  
  for (const baseWeapon of KNOWN_BASE_WEAPONS) {
    const baseWords = baseWeapon.toLowerCase().split(/\s+/);
    
    // Skip single-word weapons for now
    if (baseWords.length < 2) continue;
    
    // Find the index where the base weapon name might start
    for (let i = 0; i <= words.length - baseWords.length; i++) {
      let match = true;
      for (let j = 0; j < baseWords.length; j++) {
        if (words[i + j] !== baseWords[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        bestMatch = baseWeapon;
        logger.info(`[Autograde] Found word-by-word match: "${baseWeapon}" at word index ${i}`);
        return bestMatch; // Return immediately since this is a strong match
      }
    }
  }
  
  // Third approach: Single-word prefix matching as fallback
  if (!bestMatch && words.length > 0) {
    for (const baseWeapon of KNOWN_BASE_WEAPONS) {
      // Only check single-word weapons or first word of multi-word weapons
      const baseFirstWord = baseWeapon.toLowerCase().split(/\s+/)[0];
      
      if (words[0] === baseFirstWord || 
          words[0].startsWith(baseFirstWord) || 
          baseFirstWord.startsWith(words[0])) {
        if (baseWeapon.length > bestMatch.length) {
          bestMatch = baseWeapon;
          logger.info(`[Autograde] Found first-word match: "${baseWeapon}" matches first word "${words[0]}"`);
        }
      }
    }
  }
  
  // If we found any match, return it
  if (bestMatch) {
    logger.info(`[Autograde] Using best match: "${bestMatch}"`);
    return bestMatch;
  }
  
  // Ultimate fallback: use ocr text with basic cleanup
  logger.warn(`[Autograde] No weapon match found for: "${ocrText}"`);
  return ocrText.replace(/^[^a-zA-Z0-9-]+/, '').replace(/[^a-zA-Z0-9-]+$/, '').trim() || 'Unknown Weapon';
}
// --- End Helper Function --- 

// --- HELPER FUNCTION TO LOAD WEAPON ARRAY ---
async function loadWeaponArray(): Promise<WeaponMapEntry[]> {
  try {
    const weaponArrayPath = path.join(process.cwd(), 'dict', 'weaponArray.json');
    const data = await fs.readFile(weaponArrayPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Error loading weaponArray.json:', error);
    return [];
  }
}

/**
 * Find a weapon in the weapon array based on name matching
 */
async function findWeaponInArray(weaponName: string): Promise<WeaponMapEntry | null> {
  if (!weaponName) return null;
  
  try {
    const weaponArray = await loadWeaponArray();
    
    // Clean up the name for matching purposes
    const cleanName = weaponName.toLowerCase().trim();
    logger.info(`Looking for weapon in array: "${cleanName}"`);
    
    // Check if name contains Archgun indicators
    const containsArchgunKeywords = /\b(arch|grattler|imperator|cortege|morgha|phaedra|dual decurion|larkspur|velocitus|mausolon|ayanga|cyngas)\b/i.test(cleanName);
    if (containsArchgunKeywords) {
      logger.info(`Detected possible Archgun from name: "${cleanName}"`);
    }
    
    // Find all weapons that might match (exact or partial matches)
    const potentialMatches = weaponArray.filter(weapon => {
      const lowerWeaponName = weapon.name.toLowerCase();
      // Include exact matches and partial matches in both directions
      return lowerWeaponName === cleanName || 
             lowerWeaponName.includes(cleanName) || 
             cleanName.includes(lowerWeaponName);
    });
    
    if (potentialMatches.length === 0) {
      logger.info(`No matches found for "${cleanName}"`);
      return null;
    }
    
    logger.info(`Found ${potentialMatches.length} potential matches for "${cleanName}": ${potentialMatches.map(w => w.name).join(', ')}`);
    
    // If we detected Archgun keywords, prioritize Archguns
    if (containsArchgunKeywords) {
      // Try to find a weapon with SpaceGun category among the matches
      const archgunMatch = potentialMatches.find(weapon => {
        try {
          // Load the ExportWeapons data to check category
          const weaponPath = path.join(process.cwd(), 'dict', 'ExportWeapons.json');
          const weaponData = JSON.parse(fsSync.readFileSync(weaponPath, 'utf8'));
          const weaponInfo = weaponData[weapon.internalPath];
          
          if (weaponInfo && weaponInfo.productCategory === "SpaceGuns") {
            logger.info(`Found Archgun match: ${weapon.name}, category: ${weaponInfo.productCategory}`);
            return true;
          }
          return false;
        } catch (error) {
          logger.error(`Error checking Archgun category for ${weapon.name}:`, error);
          return false;
        }
      });
      
      if (archgunMatch) {
        logger.info(`Prioritizing Archgun match: ${archgunMatch.name} (${archgunMatch.internalPath})`);
        return archgunMatch;
      }
    }
    
    // First check if we have an exact match
    const exactMatch = potentialMatches.find(weapon => weapon.name.toLowerCase() === cleanName);
    if (exactMatch) {
      logger.info(`Found exact match: ${exactMatch.name} (${exactMatch.internalPath})`);
      
      // Even with exact match, check if there's a better variant available
      const baseNameOnly = cleanName
        .replace(/\s+(prime|kuva|tenet|wraith|vandal|prisma|dex|mara|mk-|mk\d+|coda)\b/i, '')
        .trim();
      
      // Only proceed with variant check if this isn't already a special variant
      const isAlreadyVariant = /\b(prime|kuva|tenet|wraith|vandal|prisma|dex|mara|mk-|mk\d+|coda)\b/i.test(cleanName);
      if (!isAlreadyVariant) {
        // Check for better variants of the exact match
        const variantPriority = ["prime", "kuva", "tenet", "coda", "wraith", "vandal", "prisma", "dex", "mara"];
        
        for (const variant of variantPriority) {
          const variantMatch = potentialMatches.find(weapon => 
            weapon.name.toLowerCase().includes(variant) && 
            weapon.name.toLowerCase().includes(baseNameOnly)
          );
          
          if (variantMatch) {
            logger.info(`Prioritizing ${variant} variant over exact match: ${variantMatch.name} (${variantMatch.internalPath})`);
            return variantMatch;
          }
        }
      }
      
      // If no better variant found or already a variant, use the exact match
      return exactMatch;
    }
    
    // Get the base name without variant indicators for remaining logic
    const baseNameOnly = cleanName
      .replace(/\s+(prime|kuva|tenet|wraith|vandal|prisma|dex|mara|mk-|mk\d+|coda)\b/i, '')
      .trim();
    
    // Check if we have an exact match for a variant - prioritize in this order:
    // Prime > Kuva > Tenet > Other variants
    const variantPriority = ["prime", "kuva", "tenet", "coda", "wraith", "vandal", "prisma", "dex", "mara"];
    
    // First, check if the weapon name itself contains a variant indicator
    let detectedVariant = "";
    for (const variant of variantPriority) {
      if (cleanName.includes(variant)) {
        detectedVariant = variant;
        break;
      }
    }
    
    // If we detected a specific variant, prioritize that
    if (detectedVariant) {
      const variantMatch = potentialMatches.find(weapon => 
        weapon.name.toLowerCase().includes(detectedVariant) && 
        weapon.name.toLowerCase().includes(baseNameOnly)
      );
      
      if (variantMatch) {
        logger.info(`Prioritizing detected variant: ${variantMatch.name} (${variantMatch.internalPath})`);
        return variantMatch;
      }
    }
    
    // If no specific variant was mentioned, prioritize more valuable variants in order
    for (const variant of variantPriority) {
      const variantMatch = potentialMatches.find(weapon => 
        weapon.name.toLowerCase().includes(variant) && 
        weapon.name.toLowerCase().includes(baseNameOnly)
      );
      
      if (variantMatch) {
        logger.info(`Prioritizing valuable variant: ${variantMatch.name} (${variantMatch.internalPath})`);
        return variantMatch;
      }
    }
    
    // If no variant prioritization worked, use the best match by length (closest to input)
    potentialMatches.sort((a, b) => {
      // Prefer shorter weapon names that contain the search term
      return a.name.length - b.name.length;
    });
    
    logger.info(`Using best match by length: ${potentialMatches[0].name} (${potentialMatches[0].internalPath})`);
    return potentialMatches[0];
  } catch (error) {
    logger.error('Error in findWeaponInArray:', error);
    return null;
  }
}

// --- MODIFY generateRivenGradeImage FUNCTION TO REMOVE GIF FUNCTIONALITY ---
async function generateRivenGradeImage(
  weaponName: string,
  rivenType: string,
  rank: number,
  disposition: number,
  stats: ProcessedStat[]
): Promise<Buffer> {
  // Canvas dimensions - set to standard HD resolution
  const width = 1280;
  const height = 720;
  
  // Check if background.png exists in assets folder
  const pngBackgroundPath = path.join(process.cwd(), 'assets', 'background.png');
  
  // Create a static image
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  try {
    // Check if background image exists
    if (fsSync.existsSync(pngBackgroundPath)) {
      // Load and draw background image if it exists
      try {
        const backgroundImage = await loadImage(pngBackgroundPath);
        
        // Draw background with scaling to fit canvas
        ctx.drawImage(backgroundImage, 0, 0, width, height);
        
        // Add black overlay with 50% opacity for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);
      } catch (imgError) {
        logger.error(`Error loading background image: ${imgError}`);
        // Fall back to solid background if image loading fails
        createSolidBackground(ctx, width, height);
      }
    } else {
      // If background image doesn't exist, create solid background
      logger.warn('Background image not found at: ' + pngBackgroundPath);
      createSolidBackground(ctx, width, height);
    }
  } catch (error) {
    // Fallback for any other errors
    logger.error(`Error setting up background: ${error}`);
    createSolidBackground(ctx, width, height);
  }
  
  // Set container with exactly 32px padding from all edges
  const containerX = 32;
  const containerY = 32;
  const containerWidth = width - (containerX * 2);
  const containerHeight = height - (containerY * 2);
  
  const borderRadius = 30; // Larger border radius for HD
  
  ctx.save(); // Save the current state
  
  // Create a rounded rectangle path
  createRoundedRect(
    ctx, 
    containerX, 
    containerY, 
    containerWidth, 
    containerHeight, 
    borderRadius
  );
  
  // Fill with semi-transparent dark color
  ctx.fillStyle = 'rgba(24, 27, 37, 0.50)';
  ctx.fill();
  
  ctx.restore(); // Restore to previous state
  
  // Draw the content inside the container - pass container position as padding
  await drawGradeContent(ctx, containerWidth, containerHeight, weaponName, rivenType, rank, disposition, stats, containerX, containerY);
  
  return canvas.toBuffer();
}

// Helper function to create a rounded rectangle path
function createRoundedRect(
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper function to create a solid background with subtle gradients
function createSolidBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Create a dark background with subtle gradient
  ctx.fillStyle = '#0a0a1a'; // Very dark blue, almost black
  ctx.fillRect(0, 0, width, height);
  
  // Create a clean, modern look similar to the example image
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(82, 45, 168, 0.1)'); // Very subtle purple tint
  gradient.addColorStop(1, 'rgba(23, 213, 255, 0.05)'); // Very subtle blue tint
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// Helper function to get the color for a grade
function getGradeColor(grade: string): string {
  // New color scheme based on user's requirements
  const gradeColors: Record<string, string> = {
    'S+': '#1FC16B',
    'S': '#1FC16B',
    'S-': '#1FC16B',
    'A+': '#1DAF61',
    'A': '#178C4E',
    'A-': '#1A7544',
    'B+': '#F6B51E',
    'B': '#C99A2C',
    'B-': '#E6A819',
    'C+': '#FF9147',
    'C': '#D06925',
    'C-': '#E97D35',
    'D+': '#EB5757',
    'D': '#EB5757',
    'D-': '#EB5757',
    'F': '#FB3748',
    '???': '#FB3748', // Use the same red color as F grade
    '?': '#999999'
  };
  
  return gradeColors[grade] || '#999999'; // Default to gray if grade not found
}

// Helper function to format stat values for display
function formatStatValue(statName: string, value: number): string {
  // For faction damage stats, convert from decimal to x-format
  if (statName.toLowerCase().includes('damage to')) {
    // Convert -0.2 to x0.8 format
    const multiplier = 1.0 + value;
    return `x${multiplier.toFixed(2)}`;
  }
  
  // For regular stats, just add the % sign
  return `${value > 0 ? '+' : ''}${value}%`;
}

// Add camel casing function 
function toTitleCase(text: string): string {
  // Skip if already proper case or empty
  if (!text) return text;
  
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Update the drawGradeContent function with proper capitalization and larger text
async function drawGradeContent(
  ctx: CanvasRenderingContext2D,
  containerWidth: number,
  containerHeight: number,
  weaponName: string,
  rivenType: string,
  rank: number, 
  disposition: number,
  stats: ProcessedStat[],
  containerX: number = 0,
  containerY: number = 0
): Promise<void> {
  // Define internal padding within the container
  const padding = 60; // Increased internal padding for HD resolution
  
  // Weapon Name with fancy gradient styling - scale up for HD
  const fontSize = 72; // Increased for better proportion in HD
  ctx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  
  // Create a gradient for the text - adjusted for container dimensions
  const gradient = ctx.createLinearGradient(
    containerX + padding, 
    containerY + 70, 
    containerX + containerWidth - padding, 
    containerY + 70
  );
  gradient.addColorStop(0, '#9186D0');    // Start with purple
  gradient.addColorStop(0.5048, '#D8ABA5'); // Middle pink/salmon
  gradient.addColorStop(1, '#FED28E');    // End with light orange/gold
  
  // Draw the text directly with the gradient
  ctx.fillStyle = gradient;
  ctx.fillText(weaponName, containerX + padding, containerY + 110);
  
  // Rank and disposition info
  ctx.fillStyle = '#d1d1e0'; // Light gray
  ctx.font = '28px Arial'; // Increased for HD
  ctx.textAlign = 'right';
  ctx.fillText(
    `${rank}/8 • Disposition: ${disposition.toFixed(2)}x`, 
    containerX + containerWidth - padding, 
    containerY + 110
  );
  
  // Stats - update to match requested styling with appropriate size for HD
  let yPosition = containerY + 210; // Starting position for stats
  
  // Stats font size - increased for HD resolution
  const statFontSize = 48; // Increased for better proportion in HD
  
  for (const stat of stats) {
    // Get color based on grade
    const statColor = getGradeColor(stat.grade);
    ctx.fillStyle = statColor;

    // Format stat value appropriately
    const displayValue = formatStatValue(stat.name, stat.value);

    // Apply Title Case to stat name
    const formattedStatName = toTitleCase(stat.name);

    // Stat name and value with requested styling
    ctx.font = `400 ${statFontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'left';
    
    // Draw stat value and name with Camel Case
    ctx.fillText(`${displayValue} ${formattedStatName}`, containerX + padding, yPosition);
    
    // Grade with modifier
    const plusSign = stat.percentDiff && stat.percentDiff > 0 ? '+' : '';
    const percentText = stat.percentDiff ? ` (${plusSign}${stat.percentDiff.toFixed(2)}%)` : '';
    
    ctx.textAlign = 'right';
    // Use the same font size for the grade text as the stat name
    ctx.font = `400 ${statFontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(
      `${stat.grade}${percentText}`, 
      containerX + containerWidth - padding, 
      yPosition
    );
    
    // Adjust spacing - increased for HD
    yPosition += 110; // Increased spacing to match new font size
  }
}

// --- MODIFY processRivenData FUNCTION TO USE weaponArray.json ---
async function processRivenData(
  parsedData: { weaponName: string, stats: Array<{ name: string, value: number }>, rank: number },
  imageUrl: string,
  tempFilesArray?: string[], // Add optional parameter to pass tempFiles
  selectedVariant?: WeaponMapEntry // Add optional parameter for selected variant
): Promise<{ embed: EmbedBuilder, attachmentPath?: string, variantOptions?: WeaponMapEntry[] }> {
  logger.info(`Processing riven data for weapon: ${parsedData.weaponName}`);

  // Look up the weapon in weaponArray first
  const weaponArrayEntry = selectedVariant || await findWeaponInArray(parsedData.weaponName);
  
  // Also find related weapons for the dropdown menu
  const relatedWeapons = await findRelatedWeapons(parsedData.weaponName);
  
  // Load weapon data files (assuming these paths are correct)
  const weaponsPath = path.join(process.cwd(), 'dict', 'ExportWeapons.json');
  const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
  
  let ExportWeapons: Record<string, any> = {};
  let dict: Record<string, string> = {};
  try {
    const [weaponsData, dictData] = await Promise.all([
      fs.readFile(weaponsPath, 'utf8'),
      fs.readFile(dictPath, 'utf8')
    ]);
    ExportWeapons = JSON.parse(weaponsData);
    dict = JSON.parse(dictData);
  } catch (fileError) {
    logger.error('Error reading weapon/dictionary files:', fileError);
    // Return a basic embed if data files are missing
    const errorEmbed = createEmbed({ type: 'error', title: `Riven Analysis: ${parsedData.weaponName}` });
    errorEmbed.setImage(imageUrl);
    errorEmbed.setDescription('Error loading weapon database. Cannot calculate grades.');
    return { embed: errorEmbed };
  }
  
  // Use weaponArrayEntry if available, otherwise fall back to findWeapon
  const weaponInfo = weaponArrayEntry ? {
    name: weaponArrayEntry.internalPath,
    rivenType: weaponArrayEntry.rivenType,
    omegaAttenuation: weaponArrayEntry.disposition,
    data: ExportWeapons[weaponArrayEntry.internalPath] || null,
    displayName: weaponArrayEntry.name
  } : findWeapon(parsedData.weaponName, ExportWeapons, dict);
  
  // Check if the weapon is an Archgun/SpaceGun and update the rivenType accordingly
  if (weaponInfo && weaponInfo.data && weaponInfo.data.productCategory === "SpaceGuns") {
    logger.info(`Detected Archgun (SpaceGun): ${weaponInfo.name}`);
    weaponInfo.rivenType = "LotusArchgunRandomModRare";
    logger.info(`Set rivenType to LotusArchgunRandomModRare for Archgun`);
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`Riven Analysis: ${parsedData.weaponName}`) // Use parsed name initially
    .setColor(0x7851A9) // Purple color for rivens
    .setTimestamp()
    .setFooter({
      text: 'Grades based on roll quality relative to disposition. ??? grades indicate values above 11.5% from center.'
    });
  
  // Prepare data for stat processing and image generation
  const processedStats: (ProcessedStat & { originalIndex?: number })[] = [];
  
  if (!weaponInfo) {
    embed.setDescription(`⚠️ **Weapon not found in database.** OCR might have misread the name or it's not in the list.\n*Detected Name:* "${parsedData.weaponName}"`);
    embed.setImage(imageUrl); // Use original image if no weapon found
  } else {
    // Use the display name from weaponArrayEntry if available, otherwise try dictionary
    const weaponDisplayName = weaponInfo.displayName || 
                             (dict[weaponInfo.name] || weaponInfo.name);
    
    embed.setTitle(`Riven Analysis: ${weaponDisplayName} ${formatRivenType(weaponInfo.rivenType)}`);
    // Remove disposition and rank info from embed description
    embed.setDescription(`*Using image recognition to analyze riven mod*`);
    
    logger.info(`Using weapon display name: "${weaponDisplayName}"`);
    
    // Process stats and collect data for image generation
    let totalGradeScore = 0;
    let validStatCount = 0;

    logger.info(`Processing riven stats with rank: ${parsedData.rank}/8`);
    
    // First, identify any recoil stats
    const statsWithRecoilInfo = parsedData.stats.map(stat => {
      const cleanName = stat.name.toLowerCase().trim().replace(/\s+/g, ' ');
      const isRecoil = cleanName.includes('recoil');
      return {
        ...stat,
        isRecoil
      };
    });
    
    // Calculate buffs and curses correctly (negative recoil is a buff)
    const buffsCount = statsWithRecoilInfo.filter(s => 
      (s.isRecoil && s.value < 0) || (!s.isRecoil && s.value > 0)
    ).length;
    
    const curseCount = statsWithRecoilInfo.filter(s => 
      (s.isRecoil && s.value > 0) || (!s.isRecoil && s.value < 0)
    ).length;
    
    logger.info(`Buff count: ${buffsCount}`);
    logger.info(`Curse count: ${curseCount}`);

    for (let i = 0; i < parsedData.stats.length; i++) {
      const stat = parsedData.stats[i];
      let grade = 'N/A';
      let tagName = 'unknown';
      let rollQuality = 0;

      logger.info(`[ProcessData] Processing stat object: ${JSON.stringify(stat)}`);
      logger.info(`[ProcessData] Name being passed to findTagForStatName: "${stat.name}"`);
      
      // Extra check for slide attack critical chance detection
      if (stat.name === 'Critical Chance' && stat.value < 0) {
        logger.info(`[SLIDE_CRIT_CHECK] Found negative Critical Chance (${stat.value}%), checking if this should be slide attack`);
        // Look through all stats to see if any contains 'slide'
        const hasSlideRef = parsedData.stats.some(s => s.name.toLowerCase().includes('slide'));
        if (hasSlideRef) {
          logger.info(`[SLIDE_CRIT_CHECK] Found 'slide' reference in stats, will override to Critical Chance for Slide Attack`);
          stat.name = 'Critical Chance for Slide Attack';
        }
      }
      
      // For any stat that includes 'slide' in the name, add special logging
      if (stat.name.toLowerCase().includes('slide')) {
        logger.info(`[SLIDE_STAT] Processing a slide-related stat: "${stat.name}"`);
      }
      
      if (weaponInfo) {
        // Clean up stat name to improve tag matching
        const cleanStatName = stat.name
          .toLowerCase()
          .replace(/\s*\([^)]+\)/g, '') // Remove parenthetical notes like "(x2 for Bows)"
          .replace(/\s+/g, ' ')         // Normalize whitespace
          .trim();
          
        logger.info(`[ProcessData] Cleaned stat name: "${cleanStatName}"`);
        
        // Special check for slide attack crit chance
        if (cleanStatName.includes('slide') && cleanStatName.includes('crit')) {
          logger.info(`[SLIDE_CRIT] Detected potential slide attack crit chance: "${cleanStatName}" with value ${stat.value}`);
        }
        
        // Check if this is just "Critical Chance" but could be slide attack crit
        if (cleanStatName === 'critical chance' || cleanStatName === 'crit chance') {
          // Additional logging to check for contextual clues
          logger.info(`[SLIDE_CRIT] Found generic crit chance: "${cleanStatName}" with value ${stat.value}`);
          
          // Try to look for "slide" in surrounding lines
          const allStatNames = parsedData.stats.map(s => s.name.toLowerCase());
          const hasSlideReference = allStatNames.some(name => name.includes('slide'));
          if (hasSlideReference) {
            logger.info(`[SLIDE_CRIT] Found 'slide' reference in other stat names, this might be slide attack crit`);
          }
          
          // Heuristic: Extremely high crit chance values (>200%) are often slide attack crit
          // Normal crit chance is typically under 200%, while slide attack can be much higher
          if (stat.value > 200) {
            logger.info(`[SLIDE_CRIT] Very high crit chance value (${stat.value}%), likely slide attack crit`);
            // Force tag to slide attack crit chance
            tagName = "SlideAttackCritChanceMod";
            logger.info(`[SLIDE_CRIT] Overriding tag to SlideAttackCritChanceMod based on value heuristic`);
            continue; // Skip the normal tag lookup
          }
        }
        
        tagName = rivengradeHelpers.findTagForStatName(cleanStatName);
        logger.info(`[ProcessData] Received tag from findTagForStatName: "${tagName}" for name "${cleanStatName}"`);
        
        if (tagName && tagName !== 'unknown') {
          // Special case for recoil: negative recoil is a buff (reduces recoil), not a curse
          const isRecoil = tagName === "WeaponRecoilReductionMod" || 
                          cleanStatName.toLowerCase().includes('recoil');
          
          // For recoil, negative values are buffs (reduce recoil), positive values are curses (increase recoil)
          // For other stats, negative values are curses, positive values are buffs
          const isCurse = isRecoil ? stat.value > 0 : stat.value < 0;
          
          // For recoil, we may need to invert the value for proper range calculations
          const valueForCalculation = isRecoil && stat.value < 0 ? -stat.value : stat.value;

          // Log ALL input parameters for detailed debugging
          logger.info(`[DETAILED_DEBUG] ===== CALCULATION FOR ${stat.name} (${tagName}) =====`);
          logger.info(`[DETAILED_DEBUG] Input parameters:`);
          logger.info(`[DETAILED_DEBUG] - Tag: ${tagName}`);
          logger.info(`[DETAILED_DEBUG] - Display Value: ${stat.value}`);
          logger.info(`[DETAILED_DEBUG] - Is Recoil: ${isRecoil}`);
          logger.info(`[DETAILED_DEBUG] - Value for Calculation: ${valueForCalculation}`);
          logger.info(`[DETAILED_DEBUG] - Riven Type: ${weaponInfo.rivenType}`);
          logger.info(`[DETAILED_DEBUG] - Weapon: ${weaponInfo.name}`);
          logger.info(`[DETAILED_DEBUG] - Disposition: ${weaponInfo.omegaAttenuation}`);
          logger.info(`[DETAILED_DEBUG] - Rank: ${parsedData.rank}`);
          logger.info(`[DETAILED_DEBUG] - Buff Count: ${buffsCount}`);
          logger.info(`[DETAILED_DEBUG] - Curse Count: ${curseCount}`);
          logger.info(`[DETAILED_DEBUG] - Is Curse: ${isCurse}`);

          try {
            // Get the full range for this stat
            const range = isCurse 
              ? getCurseRange(weaponInfo.rivenType, tagName, weaponInfo.omegaAttenuation, parsedData.rank, buffsCount, curseCount)
              : getBuffRange(weaponInfo.rivenType, tagName, weaponInfo.omegaAttenuation, parsedData.rank, buffsCount, curseCount);
            
            // Calculate the center of the range
            let rangeCenter;
            if (isCurse) {
              // For curse stats, we need the numerical average, not logical
              const numericMin = Math.min(range.min, range.max);
              const numericMax = Math.max(range.min, range.max);
              rangeCenter = (numericMin + numericMax) / 2;
              logger.info(`[CURSE_DEBUG] Curse range: ${range.min} to ${range.max}, numerical range: ${numericMin} to ${numericMax}, center=${rangeCenter.toFixed(3)}`);
            } else {
              rangeCenter = (range.min + range.max) / 2;
            }
            
            // Check if this is a raw value stat (not a percentage)
            const isRawValueStat = 
              tagName === 'WeaponMeleeRangeIncMod' || // Melee Range
              tagName === 'WeaponMeleeComboInitialMod' || // Initial Combo
              tagName === 'WeaponComboDurationMod' || // Combo Duration
              tagName === 'WeaponPunchThroughMod' || // Punch Through
              tagName === 'WeaponPunctureDepthMod' || // Punch Through (alternative tag)
              tagName === 'GunPunchThroughMod'; // Gun Punch Through
            
            logger.info(`[DETAILED_DEBUG] Is Raw Value Stat: ${isRawValueStat}`);
            logger.info(`[DETAILED_DEBUG] Tag Name: ${tagName}`);
            
            // Prepare the value for calculation based on stat type
            let valueForCalculation = stat.value;
            
            // For raw value stats like Punch Through, multiply by 100 for proper range comparison
            if (isRawValueStat) {
              valueForCalculation = stat.value * 100;
              logger.info(`[DETAILED_DEBUG] Converting raw value ${stat.value} to ${valueForCalculation} for calculation`);
            }
              
            // Calculate the percentage difference from center
            let percentDiffFromCenter;
            
            // Special handling for recoil stats
            if (isRecoil) {
              // For recoil, the value range is inverted from normal stats:
              // More negative value = better (for buffs)
              // More positive value = worse (for curses)
              
              if (isCurse) {
                // For positive recoil (curse), higher values are worse
                percentDiffFromCenter = ((valueForCalculation - rangeCenter) / Math.abs(rangeCenter)) * 100;
                // This will give a positive value, which is correct for curses
              } else {
                // For negative recoil (buff), more negative is better
                // For negative values, we need to work with absolute values for comparison
                const absValue = Math.abs(stat.value);
                const absMin = Math.abs(range.min);
                const absMax = Math.abs(range.max);
                const absCenter = Math.abs(rangeCenter);
                
                // Calculate direction: higher abs value = better
                // If -99.3 is between -96.2 and -117.6, it's better than min but worse than max
                if (absValue > absCenter) {
                  // Better than center (more negative)
                  percentDiffFromCenter = ((absValue - absCenter) / absCenter) * 100;
                } else {
                  // Worse than center (less negative)
                  percentDiffFromCenter = -((absCenter - absValue) / absCenter) * 100;
                }
                
                logger.info(`[RECOIL_DEBUG] Recoil buff calculation:`);
                logger.info(`[RECOIL_DEBUG] - Value: ${stat.value}, Abs: ${absValue}`);
                logger.info(`[RECOIL_DEBUG] - Range: ${range.min} to ${range.max}, Abs Range: ${absMin} to ${absMax}`);
                logger.info(`[RECOIL_DEBUG] - Center: ${rangeCenter}, Abs Center: ${absCenter}`);
                logger.info(`[RECOIL_DEBUG] - Better than center? ${absValue > absCenter}`);
                logger.info(`[RECOIL_DEBUG] - Percent diff: ${percentDiffFromCenter.toFixed(2)}%`);
              }
            } else if (isRawValueStat) {
              // For raw value stats like Range and Initial Combo, calculate how far the value is
              // from the center point of the min-max range, as a percentage of the center value
              const fullRange = Math.abs(range.max - range.min);
              
              // Only calculate if there's an actual range to work with
              if (fullRange > 0) {
                // Calculate difference of actual value from center as a percentage of center
                // Use absolute value for the center to handle negative numbers properly
                percentDiffFromCenter = ((valueForCalculation - rangeCenter) / Math.abs(rangeCenter)) * 100;
                logger.info(`[DETAILED_DEBUG] Raw Value Calculation: (${valueForCalculation} - ${rangeCenter}) / ${Math.abs(rangeCenter)} * 100 = ${percentDiffFromCenter.toFixed(2)}%`);
                
                if (isRawValueStat) {
                  logger.info(`[RANGE_DEBUG] Final percentage difference from center: ${percentDiffFromCenter.toFixed(3)}%`);
                }
              } else {
                percentDiffFromCenter = 0;
                logger.warn(`[DETAILED_DEBUG] Range is 0, defaulting percentDiffFromCenter to 0`);
              }
            } else {
              // For percentage stats, calculate the percentage difference from center
              // For negative values (curses), we need special handling to get the proper direction
              if (isCurse) {
                // For curses, less negative is better, more negative is worse
                // Example: If range is -0.3 to -0.4, center is -0.35
                // A value of -0.37 would be worse than center (more negative)
                // A value of -0.33 would be better than center (less negative)
                
                // Calculate the percentage diff relative to center, considering sign
                const valueToUse = stat.value;
                
                if (Math.abs(valueToUse) < Math.abs(rangeCenter)) {
                  // Less negative than center (better) → positive percentage
                  percentDiffFromCenter = ((Math.abs(rangeCenter) - Math.abs(valueToUse)) / Math.abs(rangeCenter)) * 100;
                } else if (Math.abs(valueToUse) > Math.abs(rangeCenter)) {
                  // More negative than center (worse) → negative percentage
                  percentDiffFromCenter = -((Math.abs(valueToUse) - Math.abs(rangeCenter)) / Math.abs(rangeCenter)) * 100;
                } else {
                  // Equal to center
                  percentDiffFromCenter = 0;
                }
                
                logger.info(`[CURSE_DEBUG] Curse calculation details:`);
                logger.info(`[CURSE_DEBUG] - Value: ${valueToUse}, Center: ${rangeCenter}`);
                logger.info(`[CURSE_DEBUG] - |Value|: ${Math.abs(valueToUse)}, |Center|: ${Math.abs(rangeCenter)}`);
                logger.info(`[CURSE_DEBUG] - Is less negative? ${Math.abs(valueToUse) < Math.abs(rangeCenter)}`);
                logger.info(`[CURSE_DEBUG] - Percent diff: ${percentDiffFromCenter.toFixed(2)}%`);
              } else {
                // For buffs, higher positive percent = higher number
                percentDiffFromCenter = ((stat.value - rangeCenter) / Math.abs(rangeCenter)) * 100;
                logger.info(`[DETAILED_DEBUG] Percentage Calculation: (${stat.value} - ${rangeCenter}) / ${Math.abs(rangeCenter)} * 100 = ${percentDiffFromCenter.toFixed(2)}%`);
              }
            }
            
            // Log the ranges and calculations
            logger.info(`[DETAILED_DEBUG] Range: ${range.min.toFixed(3)} to ${range.max.toFixed(3)}`);
            logger.info(`[DETAILED_DEBUG] Range Center: ${rangeCenter.toFixed(3)}`);
            logger.info(`[DETAILED_DEBUG] Actual Value: ${stat.value.toFixed(3)}`);
            if (isRecoil || isRawValueStat) {
              logger.info(`[DETAILED_DEBUG] Value For Calculation: ${valueForCalculation.toFixed(3)}`);
            }
            logger.info(`[DETAILED_DEBUG] Percent Diff From Center: ${percentDiffFromCenter.toFixed(3)}%`);
            
            // Additional debugging for faction damage stats
            if (cleanStatName.includes('damage to')) {
              logger.info(`[FACTION_COMPARE] ===== FACTION DEBUGGING IN PROCESS FUNCTION =====`);
              logger.info(`[FACTION_COMPARE] Stat Name: ${cleanStatName}`);
              logger.info(`[FACTION_COMPARE] Raw Range from getRivenRange: ${range.min.toFixed(3)} to ${range.max.toFixed(3)}`);
              logger.info(`[FACTION_COMPARE] Calculated Center: ${rangeCenter.toFixed(3)}`);
              logger.info(`[FACTION_COMPARE] Actual Value: ${stat.value.toFixed(3)}`);
              logger.info(`[FACTION_COMPARE] Calculation Params: Riven Type=${weaponInfo.rivenType}, Disposition=${weaponInfo.omegaAttenuation}, Rank=${parsedData.rank}, Buffs=${buffsCount}, Curses=${curseCount}`);
              
              // Calculate what the raw range would be using the STAT_RANGES directly to verify consistency
              const statName = cleanStatName;
              const statInfo = STAT_RANGES[statName];
              if (statInfo) {
                const isCurse = stat.value < 0;
                const { min, max } = isCurse ? statInfo.negative : statInfo.positive;
                const rawMin = min * weaponInfo.omegaAttenuation * (1 + (0.125 * parsedData.rank));
                const rawMax = max * weaponInfo.omegaAttenuation * (1 + (0.125 * parsedData.rank));
                
                // Log the direct calculation to compare with the range from the function
                logger.info(`[FACTION_COMPARE] Direct calculation from STAT_RANGES:`);
                logger.info(`[FACTION_COMPARE] Raw values from STAT_RANGES: min=${min}, max=${max}`);
                logger.info(`[FACTION_COMPARE] Calculated: min=${rawMin.toFixed(3)}, max=${rawMax.toFixed(3)}`);
                logger.info(`[FACTION_COMPARE] Center from direct calc: ${((rawMin + rawMax) / 2).toFixed(3)}`);
                
                // Check for inconsistency
                const hasInconsistency = 
                  Math.abs(rawMin - range.min) > 0.001 || 
                  Math.abs(rawMax - range.max) > 0.001;
                
                if (hasInconsistency) {
                  logger.warn(`[FACTION_COMPARE] INCONSISTENCY DETECTED between direct calc and range function!`);
                }
              }
              
              logger.info(`[FACTION_COMPARE] ===== END FACTION DEBUGGING =====`);
            }
            
            // Determine grade directly based on percentage difference
            const absDiff = Math.abs(percentDiffFromCenter);
            let grade;
            
            // Check for extremely high values (beyond normal grading scale)
            if (absDiff > 11.5) {
              grade = "???";
            }
            // Assign grade based on the ranges in the grade chart
            // Use the sign of the percentage difference to determine scale, NOT whether it's a buff/curse
            else if (absDiff >= 9.5) {
              grade = percentDiffFromCenter < 0 ? "F" : "S";
            } else if (absDiff >= 7.5) {
              grade = percentDiffFromCenter < 0 ? "C-" : "A+";
            } else if (absDiff >= 5.5) {
              grade = percentDiffFromCenter < 0 ? "C" : "A";
            } else if (absDiff >= 3.5) {
              grade = percentDiffFromCenter < 0 ? "C+" : "A-";
            } else if (absDiff >= 1.5) {
              grade = percentDiffFromCenter < 0 ? "B-" : "B+";
            } else {
              grade = "B"; // Center grade
            }
            
            // Map the percentage difference to a 0-1 scale for visualization
            // This is only for generating the image/visualization, not for grading
            let rollQuality = 0.5; // Default center value
            
            // For recoil buffs, the percentDiffFromCenter calculation is already corrected
            // so we can use the standard mapping
            if (isCurse) {
              // For curses, stronger curse = higher number (opposite of goodness scale)
              rollQuality = Math.min(1.0, 0.5 + (absDiff / 11.5) * 0.5);
            } else {
              // For buffs, higher positive percent = higher number
              rollQuality = 0.5 + (percentDiffFromCenter / 11.5) * 0.5;
              // Clamp to 0-1 range
              rollQuality = Math.max(0, Math.min(1, rollQuality));
            }
            
            logger.info(`[DETAILED_DEBUG] Direct Grade: ${grade}`);
            logger.info(`[DETAILED_DEBUG] Visualization Quality: ${rollQuality.toFixed(5)} (0-1 scale)`);
            logger.info(`[DETAILED_DEBUG] ===== END CALCULATION FOR ${stat.name} =====`);
            
            // For overall score calculation, treat both buffs and curses the same way:
            // Higher magnitude from center = better quality
            const qualityForOverall = rollQuality;
            totalGradeScore += qualityForOverall;
            validStatCount++;
            
            // Add to processed stats for image generation with percent diff from center and original index
            processedStats.push({
              name: stat.name,
              value: stat.value,
              grade: grade,
              rollQuality: rollQuality,
              percentDiff: percentDiffFromCenter, // Add the percent diff for display
              originalIndex: i // Store the original position
            });
          } catch (calcError) {
            logger.error(`[DETAILED_DEBUG] Error in calculation:`, calcError);
            grade = 'ERROR';
            
            // Add to processed stats with error info (without percentage)
            processedStats.push({
              name: stat.name,
              value: stat.value,
              grade: 'ERROR',
              rollQuality: 0,
              originalIndex: i
            });
          }
        } else {
          logger.warn(`Unknown stat name: ${stat.name}, could not find matching tag`);
          
          // Add to processed stats as unknown (without percentage)
          processedStats.push({
            name: stat.name,
            value: stat.value,
            grade: 'N/A',
            rollQuality: 0,
            originalIndex: i
          });
        }
      }
      
      // Remove individual stat fields - they will be shown in the image only
    }

    // Remove "Parsed Stats & Grades" section - it will be shown in the image only
    
    // Remove "Overall Grade" field - it will be shown in the image only
    
    // Generate the grade image if we have weapon info
    try {
      // Use weaponDisplayName for the image
      const weaponDisplayName = weaponInfo.displayName || 
                             (dict[weaponInfo.name] || weaponInfo.name);
      
      const buffer = await generateRivenGradeImage(
        weaponDisplayName,
        formatRivenType(weaponInfo.rivenType),
        parsedData.rank,
        weaponInfo.omegaAttenuation,
        processedStats
      );
      
      // Create a temporary file to store the image
      const tempImagePath = path.join(os.tmpdir(), `riven-grade-${Date.now()}.png`);
      await fs.writeFile(tempImagePath, buffer);
      
      // Set the image in the embed
      embed.setImage(`attachment://riven-grade.png`);
      
      // Add to tempFiles array if provided
      if (tempFilesArray) {
        tempFilesArray.push(tempImagePath);
      } else {
        // Delete the file after a delay (30 seconds)
        setTimeout(async () => {
          try {
            if (fsSync.existsSync(tempImagePath)) {
              await fs.unlink(tempImagePath);
            }
          } catch (error) {
            logger.error(`Failed to delete temporary grade image: ${error}`);
          }
        }, 30000);
      }
      
      logger.info(`Generated grade image at ${tempImagePath}`);
      
      // Return both the embed and the attachment path
      return { 
        embed,
        attachmentPath: tempImagePath,
        variantOptions: relatedWeapons.length > 1 ? relatedWeapons : undefined
      };
    } catch (imageError) {
      logger.error(`Failed to generate grade image: ${imageError}`);
      embed.setImage(imageUrl); // Fallback to original image
    }
  }
  
  // Before passing to the image generation, sort back to original order
  processedStats.sort((a, b) => {
    // Sort by originalIndex if available
    if (a.originalIndex !== undefined && b.originalIndex !== undefined) {
      return a.originalIndex - b.originalIndex;
    }
    // Fallback for items without index
    return 0;
  });
  
  // Return with appropriate values
  return { 
    embed,
    variantOptions: relatedWeapons.length > 1 ? relatedWeapons : undefined
  };
}

// Draw the grade table shown in the image
function drawGradeTable(ctx: any, x: number, y: number) {
  // Draw "Positive" label
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('Positive', 20, y + 30);
  
  // Draw "Negative" label
  ctx.fillStyle = '#ff0000';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('Negative', 20, y + 130);
  
  // Draw the grade box
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 60, y, 300, 80);
  
  ctx.strokeStyle = '#ff0000';
  ctx.strokeRect(x + 60, y + 80, 300, 80);
  
  // Grade ranges for both positive and negative
  const grades = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'F'];
  const ranges = ['9.5-11.5', '7.5-9.5', '5.5-7.5', '3.5-5.5', '1.5-3.5', '1.5-1.5', '1.5-3.5', '3.5-5.5', '5.5-7.5', '7.5-9.5', '9.5-11.5'];
  
  // Fill in positive grades (S through B)
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i < 5 ? '#00ff00' : '#ffff00'; // Green for S-B+, yellow for B
    ctx.font = 'bold 20px Arial';
    ctx.fillText(grades[i], x + 80, y + 20 + i * 13);
    ctx.font = '16px Arial';
    ctx.fillText(ranges[i], x + 120, y + 20 + i * 13);
  }
  
  // Fill in negative grades (B- through F)
  for (let i = 6; i < 11; i++) {
    const gradient = (i - 6) / 4; // 0 for B-, 1 for F
    const r = Math.floor(255 * (gradient * 0.7 + 0.3)); // Transition from yellow to red
    const g = Math.floor(255 * (1 - gradient * 0.7)); 
    ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
    ctx.font = 'bold 20px Arial';
    ctx.fillText(grades[i], x + 80, y + 20 + (i + 1) * 13);
    ctx.font = '16px Arial';
    ctx.fillText(ranges[i], x + 120, y + 20 + (i + 1) * 13);
  }
}

// Use module.exports for compatibility with the require() based command loader
module.exports = {
  data: autogradeCommandData,
  execute: autogradeCommandExecute,
  processRivenData, // Also export processRivenData so it can be used by other modules
  setupVariantCollector // Export the setupVariantCollector function
} as Command & { 
  processRivenData: typeof processRivenData,
  setupVariantCollector: typeof setupVariantCollector
};

// Change to standard module exports like rivengrade.ts
const command: Command = {
  data: autogradeCommandData as SlashCommandBuilder,
  execute: autogradeCommandExecute
};

module.exports = command;
module.exports.processRivenData = processRivenData;
module.exports.setupVariantCollector = setupVariantCollector;

// Add a function to find all related weapon variants
async function findRelatedWeapons(baseName: string): Promise<WeaponMapEntry[]> {
  try {
    const weaponArray = await loadWeaponArray();
    
    // Clean up the base name to remove variants like Prime, Kuva, Tenet, etc.
    const cleanBaseName = baseName
      .replace(/\s+(prime|kuva|tenet|wraith|vandal|prisma|dex|mara|mk-|mk\d+|coda)\b/i, '')
      .trim();
    
    logger.info(`Finding related weapons for base name: "${cleanBaseName}"`);
    
    // Find all weapons that contain the cleaned base name
    const relatedWeapons = weaponArray.filter(weapon => {
      const lowerWeapon = weapon.name.toLowerCase();
      const lowerBase = cleanBaseName.toLowerCase();
      
      // Check if the weapon contains the base name (allowing for prefixes and suffixes)
      // For example, "Kuva Braton" would match "Braton"
      return lowerWeapon.includes(lowerBase);
    });
    
    logger.info(`Found ${relatedWeapons.length} related weapons for "${cleanBaseName}": ${relatedWeapons.map(w => w.name).join(', ')}`);
    
    return relatedWeapons;
  } catch (error) {
    logger.error('Error finding related weapons:', error);
    return [];
  }
}

// Function to setup the collector for variant selection
function setupVariantCollector(
  message: any,
  parsedData: { weaponName: string, stats: Array<{ name: string, value: number }>, rank: number },
  imageUrl: string,
  tempFiles: string[]
) {
  // Create a collector that will listen for 60 seconds
  const collector = message.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect, 
    time: 60000 // 60 second timeout
  });
  
  collector.on('collect', async (selectInteraction: any) => {
    // Defer the update to give us time to process
    await selectInteraction.deferUpdate();
    
    // Get the selected variant name
    const selectedVariantName = selectInteraction.values[0];
    logger.info(`User selected variant: ${selectedVariantName}`);
    
    // Find the weapon in the array
    const weaponArray = await loadWeaponArray();
    const selectedVariant = weaponArray.find(w => w.name === selectedVariantName);
    
    if (selectedVariant) {
      // Process data with the selected variant
      const { embed, attachmentPath } = await processRivenData(parsedData, imageUrl, tempFiles, selectedVariant);
      
      // Update the message with the new embed and attachment
      if (attachmentPath) {
        const attachment = new AttachmentBuilder(attachmentPath, { name: 'riven-grade.png' });
        await selectInteraction.editReply({ 
          embeds: [embed], 
          files: [attachment],
          components: message.components // Keep the dropdown
        });
      } else {
        await selectInteraction.editReply({ 
          embeds: [embed],
          components: message.components // Keep the dropdown
        });
      }
    } else {
      // If variant not found, just acknowledge the interaction
      logger.warn(`Could not find selected variant: ${selectedVariantName}`);
    }
  });
  
  collector.on('end', () => {
    // When the collector ends (timeout), disable the dropdown
    const disabledComponents = message.components.map((row: any) => {
      const newRow = new ActionRowBuilder<StringSelectMenuBuilder>();
      row.components.forEach((component: any) => {
        newRow.addComponents(
          StringSelectMenuBuilder.from(component).setDisabled(true)
        );
      });
      return newRow;
    });
    
    // Update the message with disabled components
    message.edit({ components: disabledComponents }).catch((err: Error) => {
      logger.error('Error disabling dropdown after timeout:', err);
    });
  });
}

// Load the stat ranges statically
const STAT_RANGES: {
  [key: string]: {
    positive: { min: number; max: number };
    negative: { min: number; max: number };
  }
} = {
  "damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "critical chance": {
    positive: { min: 0.4, max: 2.0 },
    negative: { min: -0.3, max: -0.6 }
  },
  "critical damage": {
    positive: { min: 0.4, max: 1.8 },
    negative: { min: -0.3, max: -0.6 }
  },
  "electricity damage": {
    positive: { min: 0.4, max: 1.8 },
    negative: { min: -0.3, max: -0.6 }
  },
  "heat damage": {
    positive: { min: 0.4, max: 1.8 },
    negative: { min: -0.3, max: -0.6 }
  },
  "cold damage": {
    positive: { min: 0.4, max: 1.8 },
    negative: { min: -0.3, max: -0.6 }
  },
  "toxin damage": {
    positive: { min: 0.4, max: 1.8 },
    negative: { min: -0.3, max: -0.6 }
  },
  "impact damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "puncture damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "slash damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "status chance": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "status duration": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "fire rate": {
    positive: { min: 0.2, max: 1.0 },
    negative: { min: -0.2, max: -0.5 }
  },
  "magazine capacity": {
    positive: { min: 0.2, max: 1.0 },
    negative: { min: -0.2, max: -0.5 }
  },
  "ammo maximum": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "multishot": {
    positive: { min: 0.2, max: 1.0 },
    negative: { min: -0.2, max: -0.5 }
  },
  "punch through": {
    positive: { min: 1.0, max: 4.0 },
    negative: { min: -0.3, max: -0.7 }
  },
  "recoil": {
    positive: { min: -0.3, max: -0.7 },
    negative: { min: 0.3, max: 0.7 }
  },
  "reload speed": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "projectile speed": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "damage to corpus": {
    positive: { min: 0.15, max: 0.8 },
    negative: { min: -0.15, max: -0.4 }
  },
  "damage to grineer": {
    positive: { min: 0.15, max: 0.8 },
    negative: { min: -0.15, max: -0.4 }
  },
  "damage to infested": {
    positive: { min: 0.15, max: 0.8 },
    negative: { min: -0.15, max: -0.4 }
  },
  "zoom": {
    positive: { min: 0.2, max: 1.0 },
    negative: { min: -0.2, max: -0.5 }
  },
  "melee damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "combo duration": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "slide crit chance": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "range": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "finisher damage": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "combo efficiency": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "initial combo": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "melee combo count chance": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  },
  "heavy attack efficiency": {
    positive: { min: 0.3, max: 1.5 },
    negative: { min: -0.3, max: -0.7 }
  }
};

/**
 * Calculate the grade for a stat based on its value and range
 */
function calculateGrade(
  statName: string,
  statValue: number,
  weaponDisposition: number,
  rivenStatType: string,
  isPositive: boolean,
  rank: number,
  buffsCount: number = 3,  // Default to 3 if not provided, but should be passed from caller
  cursesCount: number = 1  // Default to 1 if not provided, but should be passed from caller
): { grade: string, percentDiffFromCenter: number | null } {
  const statInfo = STAT_RANGES[statName];
  if (!statInfo) {
    logger.warn(`No stat range info for: ${statName}`);
    return { grade: '?', percentDiffFromCenter: null };
  }
  
  // Handle faction damage calculation differently (it's displayed as a multiplier)
  const isFactionDamage = statName.toLowerCase().includes('faction') && 
                          statName.toLowerCase().includes('damage');
  
  // Get the tag for this stat to use with getRivenRange functions
  const tagName = rivengradeHelpers.findTagForStatName(statName);
  
  let actualMin, actualMax;
  
  if (isFactionDamage && tagName !== 'unknown') {
    // For faction damage, use the getRivenRange functions for accurate ranges
    // The functions in rivengrade.ts properly handle the weapon disposition and scaling
    
    // Use the actual buff/curse counts passed from the caller
    // Don't override with hardcoded values
    
    // Use the proper range calculation from rivengrade.ts
    const range = isPositive 
      ? rivengradeHelpers.getBuffRange(rivenStatType, tagName, weaponDisposition, rank, buffsCount, cursesCount)
      : rivengradeHelpers.getCurseRange(rivenStatType, tagName, weaponDisposition, rank, buffsCount, cursesCount);
    
    actualMin = range.min;
    actualMax = range.max;
    
    logger.info(`[FACTION_DEBUG] Using getRivenRange for faction damage: ${statName}`);
    logger.info(`[FACTION_DEBUG] Using buff count: ${buffsCount}, curse count: ${cursesCount}`);
    logger.info(`[FACTION_DEBUG] Range from getRivenRange: ${actualMin.toFixed(3)} to ${actualMax.toFixed(3)}`);
  } else {
    // Get the appropriate stat ranges based on whether it's a positive or negative stat
    const { min, max } = isPositive ? statInfo.positive : statInfo.negative;
    
    // For regular stats, calculate normally
    actualMin = min * weaponDisposition * (1 + (0.125 * rank));
    actualMax = max * weaponDisposition * (1 + (0.125 * rank));
  }
  
  // Debug logs for faction damage
  if (isFactionDamage) {
    logger.info(`[FACTION_DEBUG] Processing faction damage for stat: ${statName}`);
    logger.info(`[FACTION_DEBUG] Calculated min/max: ${actualMin.toFixed(3)}/${actualMax.toFixed(3)}`);
  }
  
  // For faction damage, we need to ensure the correct ordering of min/max
  // Since faction damage is negative but displayed as a multiplier
  if (isFactionDamage) {
    // For faction damage, the "more negative" value is actually better
    // So the min should be numerically higher than max (closer to zero)
    if (actualMin < actualMax) {
      [actualMin, actualMax] = [actualMax, actualMin];
      logger.info(`[FACTION_DEBUG] Swapped min/max for faction damage: ${actualMin.toFixed(3)}/${actualMax.toFixed(3)}`);
    }
  }
  
  // Calculate the center of the range
  const center = (actualMin + actualMax) / 2;
  
  // Calculate how far the value is from the center as a percentage
  let percentDiffFromCenter = null;
  
  // Only calculate percent difference if stat is not a raw value
  const isRawValueStat = [
    'melee range', 'initial combo', 'combo duration',
    'range',  // These are shown as raw values like "2.5m Range" in the game
  ].includes(statName.toLowerCase());
  
  // For faction damage multipliers
  if (isFactionDamage) {
    // For faction damage, calculate percentage difference using absolute values
    // Display value is like "x0.63" but internal value is -0.37
    const absCenter = Math.abs(center);
    const absValue = Math.abs(statValue);
    
    // Calculate the difference from center as a percentage
    // For faction damage, the more negative (lower absolute value) is better
    percentDiffFromCenter = ((absValue - absCenter) / absCenter) * 100;
    
    // Log detailed information for debugging
    logger.info(`[FACTION_DEBUG] Stat Value: ${statValue.toFixed(3)}, Center: ${center.toFixed(3)}`);
    logger.info(`[FACTION_DEBUG] Abs Value: ${absValue.toFixed(3)}, Abs Center: ${absCenter.toFixed(3)}`);
    logger.info(`[FACTION_DEBUG] Percent Diff: ${percentDiffFromCenter.toFixed(2)}%`);
    logger.info(`[FACTION_DEBUG] Original calculation: ((${absValue.toFixed(3)} - ${absCenter.toFixed(3)}) / ${absCenter.toFixed(3)}) * 100 = ${percentDiffFromCenter.toFixed(2)}%`);
    
    // Special detailed debug
    logger.info(`[DETAILED_DEBUG] Tag Name: ${rivengradeHelpers.findTagForStatName(statName)}`);
    logger.info(`[DETAILED_DEBUG] Percentage Calculation: (${statValue.toFixed(3)} - ${center.toFixed(3)}) / ${Math.abs(center).toFixed(3)} * 100 = ${percentDiffFromCenter.toFixed(3)}%`);
    logger.info(`[DETAILED_DEBUG] Range: ${actualMin.toFixed(3)} to ${actualMax.toFixed(3)}`);
    logger.info(`[DETAILED_DEBUG] Range Center: ${center.toFixed(3)}`);
    logger.info(`[DETAILED_DEBUG] Actual Value: ${statValue.toFixed(3)}`);
    logger.info(`[DETAILED_DEBUG] Percent Diff From Center: ${percentDiffFromCenter.toFixed(3)}%`);
    
    // Adjust for the special case of faction damage where more negative is better
    if (isPositive) {
      // If it's somehow a positive faction damage (unusual), higher is better
      // So the calculation above is fine
    } else {
      // For negative faction damage, lower absolute value (closer to zero) is worse,
      // higher absolute value (further from zero) is better
      // We need to invert the percentage calculation
      percentDiffFromCenter = -percentDiffFromCenter;
      logger.info(`[FACTION_DEBUG] Inverted percent diff for negative faction damage: ${percentDiffFromCenter.toFixed(2)}%`);
      // ADDED: Update the detailed debug log with the inverted percentage
      logger.info(`[DETAILED_DEBUG] Inverted Percent Diff: ${percentDiffFromCenter.toFixed(3)}%`);
    }
  } 
  else if (isRawValueStat) {
    // Handle stats displayed as raw values (like melee range)
    // For these, we treat the values as direct percentages of the base value (100)
    // So a range value of 2.6m is 260% of the base, 2.8m is 280%, etc.
    const valueAsPercent = statValue * 100;
    const centerAsPercent = center * 100;
    
    percentDiffFromCenter = ((valueAsPercent - centerAsPercent) / centerAsPercent) * 100;
    
    logger.info(`[RANGE_DEBUG] Raw Value Stat: ${statName}`);
    logger.info(`[RANGE_DEBUG] Values: min=${actualMin.toFixed(3)}, max=${actualMax.toFixed(3)}, center=${center.toFixed(3)}`);
    logger.info(`[RANGE_DEBUG] Displayed in-game: Value=${statValue.toFixed(2)}, Center=${center.toFixed(2)}`);
    logger.info(`[RANGE_DEBUG] As percent: Value=${valueAsPercent.toFixed(1)}%, Center=${centerAsPercent.toFixed(1)}%`);
    logger.info(`[RANGE_DEBUG] Percent diff from center: ${percentDiffFromCenter.toFixed(2)}%`);
  }
  else {
    // For regular percentage stats
    if (center !== 0) {
      percentDiffFromCenter = ((statValue - center) / Math.abs(center)) * 100;
    }
  }
  
  // Check distance from center for grade
  const distance = Math.abs(statValue - center);
  const range = Math.abs(actualMax - actualMin);
  
  // Calculate where in the range it falls (0 = min, 1 = max)
  const position = range === 0 ? 0.5 : distance / (range / 2);
  
  // Assign grade based on position in the range
  let grade = '';
  
  // A position of 0 is exactly at center, position of 1 is at min/max
  if (position <= 0.1) {
    grade = 'C';
  } else if (position <= 0.3) {
    grade = 'B-';
  } else if (position <= 0.5) {
    grade = 'B';
  } else if (position <= 0.7) {
    grade = 'B+';
  } else if (position <= 0.8) {
    grade = 'A-';
  } else if (position <= 0.9) {
    grade = 'A';
  } else {
    grade = 'A+';
  }
  
  // For negative stats, better = closer to 0, worse = more negative
  // For faction damage specifically, better = more negative
  if (!isPositive && !isFactionDamage) {
    // Flip the grade for negative stats (except faction damage)
    const grades = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+'];
    const index = grades.indexOf(grade);
    if (index !== -1) {
      // Calculate the opposite grade
      grade = grades[grades.length - 1 - index];
    }
  }

  // Special debug for faction damage
  if (isFactionDamage) {
    logger.info(`[FACTION_DEBUG] Final grade for ${statName}: ${grade} (${percentDiffFromCenter?.toFixed(2)}%)`);
    logger.info(`[FACTION_DEBUG] Range: ${actualMin.toFixed(3)} to ${actualMax.toFixed(3)}, Center: ${center.toFixed(3)}`);
    logger.info(`[FACTION_DEBUG] Position in range: ${position.toFixed(3)}`);
    logger.info(`[DETAILED_DEBUG] Direct Grade: ${grade}`);
  }
  
  return { grade, percentDiffFromCenter };
}

// This would be somewhere in the OCR processing code, likely after receiving the OCR results
// Add this right after receiving the OCR text and before processing it

// Find where the OCR response is processed
async function processOCRResponse(ocrResponse: any) {
  // Log the complete raw OCR output
  logger.info(`[OCR_RAW] ===== COMPLETE RAW OCR OUTPUT =====`);
  logger.info(`[OCR_RAW] Full text: ${JSON.stringify(ocrResponse.text)}`);
  
  if (ocrResponse.lines && Array.isArray(ocrResponse.lines)) {
    logger.info(`[OCR_RAW] OCR returned ${ocrResponse.lines.length} lines`);
    
    // Log each line with its exact content and position
    ocrResponse.lines.forEach((line: any, index: number) => {
      logger.info(`[OCR_RAW] Line ${index}: "${line.text}" (Confidence: ${line.confidence || 'N/A'}, Position: ${JSON.stringify(line.bounds || 'N/A')})`);
    });
  } else {
    logger.info(`[OCR_RAW] OCR response doesn't contain structured line data`);
  }
  
  logger.info(`[OCR_RAW] ===== END RAW OCR OUTPUT =====`);
  
  // Continue with existing processing
  // ... existing code ...
}