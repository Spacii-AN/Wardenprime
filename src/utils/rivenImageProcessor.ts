import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { logger } from './logger';

/**
 * Color ranges that identify a riven mod card
 * Purple border, dark gray/black background with white text
 */
const RIVEN_COLORS = {
  border: {
    purple: {
      r: { min: 120, max: 200 },
      g: { min: 50, max: 150 },
      b: { min: 180, max: 255 }, 
    }
  },
  background: {
    dark: {
      r: { min: 10, max: 50 },
      g: { min: 10, max: 50 },
      b: { min: 10, max: 60 },
    }
  }
};

/**
 * Detects riven mod card in an image and crops it to just the card
 * @param inputImagePath Path to the input image
 * @returns Path to the cropped image or null if detection failed
 */
export async function detectAndCropRivenCard(inputImagePath: string): Promise<string | null> {
  try {
    logger.info(`Attempting to detect and crop riven card from ${inputImagePath}`);
    
    // Create output file path
    const croppedFilePath = path.join(os.tmpdir(), `riven-cropped-${Date.now()}.png`);
    
    // Get image metadata
    const metadata = await sharp(inputImagePath).metadata();
    const { width, height } = metadata;
    
    if (!width || !height) {
      logger.warn(`Could not get image dimensions for ${inputImagePath}`);
      return null;
    }
    
    // Convert image to RGB and get pixel data
    const { data, info } = await sharp(inputImagePath)
      .resize({ width: Math.min(width, 1000), height: Math.min(height, 1000), fit: 'inside' }) // Downsample for faster processing
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const resizedWidth = info.width;
    const resizedHeight = info.height;
    
    // Find purple border pixels (riven cards have distinctive purple borders)
    const purplePixels: { x: number, y: number }[] = [];
    for (let y = 0; y < resizedHeight; y++) {
      for (let x = 0; x < resizedWidth; x++) {
        const idx = (y * resizedWidth + x) * 3; // RGB format (3 channels)
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if this pixel is in the purple range of riven borders
        if (r >= RIVEN_COLORS.border.purple.r.min && r <= RIVEN_COLORS.border.purple.r.max &&
            g >= RIVEN_COLORS.border.purple.g.min && g <= RIVEN_COLORS.border.purple.g.max &&
            b >= RIVEN_COLORS.border.purple.b.min && b <= RIVEN_COLORS.border.purple.b.max) {
          purplePixels.push({ x, y });
        }
      }
    }
    
    // If we didn't find enough purple pixels, this may not be a riven card
    if (purplePixels.length < 100) {
      logger.warn(`Not enough purple border pixels found (${purplePixels.length}), may not be a riven card`);
      return null;
    }
    
    // Find bounding box of purple pixels
    let minX = resizedWidth;
    let minY = resizedHeight;
    let maxX = 0;
    let maxY = 0;
    
    for (const pixel of purplePixels) {
      if (pixel.x < minX) minX = pixel.x;
      if (pixel.y < minY) minY = pixel.y;
      if (pixel.x > maxX) maxX = pixel.x;
      if (pixel.y > maxY) maxY = pixel.y;
    }
    
    // Add padding to ensure we get the full card
    const paddingX = Math.floor((maxX - minX) * 0.08);
    const paddingY = Math.floor((maxY - minY) * 0.15);
    
    minX = Math.max(0, minX - paddingX);
    minY = Math.max(0, minY - paddingY * 2);
    maxX = Math.min(resizedWidth - 1, maxX + paddingX);
    maxY = Math.min(resizedHeight - 1, maxY + paddingY);
    
    // Calculate crop dimensions
    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;
    
    // If bounding box is too small, it's probably not a riven card
    if (cropWidth < 50 || cropHeight < 50) {
      logger.warn(`Detected riven area too small (${cropWidth}x${cropHeight}), may not be a riven card`);
      return null;
    }
    
    // Verify ratio is appropriate for a riven card (roughly 2:3 or similar)
    const ratio = cropHeight / cropWidth;
    if (ratio < 1.3 || ratio > 1.8) {
      logger.warn(`Detected riven area has unusual aspect ratio (${ratio.toFixed(2)}), may not be a riven card`);
      // We'll still try to crop it, but log a warning
    }
    
    // Scale the crop back to original image dimensions
    const scaleX = width / resizedWidth;
    const scaleY = height / resizedHeight;
    
    const originalMinX = Math.floor(minX * scaleX);
    const originalMinY = Math.floor(minY * scaleY);
    const originalCropWidth = Math.floor(cropWidth * scaleX);
    const originalCropHeight = Math.floor(cropHeight * scaleY);
    
    logger.info(`Cropping riven card at coordinates: x=${originalMinX}, y=${originalMinY}, width=${originalCropWidth}, height=${originalCropHeight}`);
    
    // Crop the original image and save
    await sharp(inputImagePath)
      .extract({
        left: originalMinX,
        top: originalMinY,
        width: originalCropWidth,
        height: originalCropHeight
      })
      .toFile(croppedFilePath);
    
    logger.info(`Successfully cropped riven card to ${croppedFilePath}`);
    return croppedFilePath;
  } catch (error) {
    logger.error(`Error detecting and cropping riven card: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Alternative method that checks for the characteristic dark background with stats
 * @param inputImagePath Path to the input image
 * @returns Path to the cropped image or null if detection failed
 */
export async function detectRivenByBackground(inputImagePath: string): Promise<string | null> {
  try {
    logger.info(`Attempting to detect riven by background pattern from ${inputImagePath}`);
    
    // Create output file path
    const croppedFilePath = path.join(os.tmpdir(), `riven-bg-cropped-${Date.now()}.png`);
    
    // Get image metadata
    const metadata = await sharp(inputImagePath).metadata();
    const { width, height } = metadata;
    
    if (!width || !height) {
      logger.warn(`Could not get image dimensions for ${inputImagePath}`);
      return null;
    }
    
    // Convert image to RGB and get pixel data
    const { data, info } = await sharp(inputImagePath)
      .resize({ width: Math.min(width, 800), height: Math.min(height, 800), fit: 'inside' }) // Downsample for faster processing
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const resizedWidth = info.width;
    const resizedHeight = info.height;
    
    // Identify dark background regions (riven cards have a dark background with stats)
    // We'll segment the image into a grid and check each cell for dark pixels
    const gridSize = 20; // 20x20 grid
    const cellWidth = Math.floor(resizedWidth / gridSize);
    const cellHeight = Math.floor(resizedHeight / gridSize);
    
    const darkCells: boolean[][] = Array(gridSize).fill(false).map(() => Array(gridSize).fill(false));
    
    // Count dark pixels in each cell
    for (let y = 0; y < resizedHeight; y++) {
      const gridY = Math.floor(y / cellHeight);
      if (gridY >= gridSize) continue;
      
      for (let x = 0; x < resizedWidth; x++) {
        const gridX = Math.floor(x / cellWidth);
        if (gridX >= gridSize) continue;
        
        const idx = (y * resizedWidth + x) * 3; // RGB format (3 channels)
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if this pixel is in the dark range typical of riven backgrounds
        if (r >= RIVEN_COLORS.background.dark.r.min && r <= RIVEN_COLORS.background.dark.r.max &&
            g >= RIVEN_COLORS.background.dark.g.min && g <= RIVEN_COLORS.background.dark.g.max &&
            b >= RIVEN_COLORS.background.dark.b.min && b <= RIVEN_COLORS.background.dark.b.max) {
          darkCells[gridY][gridX] = true;
        }
      }
    }
    
    // Find connected regions of dark cells (representing the riven card background)
    const visited: boolean[][] = Array(gridSize).fill(false).map(() => Array(gridSize).fill(false));
    const regions: Array<{minX: number, minY: number, maxX: number, maxY: number, size: number}> = [];
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (darkCells[y][x] && !visited[y][x]) {
          // Found a new dark region, explore it with BFS
          const regionCells: Array<{x: number, y: number}> = [];
          const queue: Array<{x: number, y: number}> = [{x, y}];
          visited[y][x] = true;
          
          while (queue.length > 0) {
            const cell = queue.shift()!;
            regionCells.push(cell);
            
            // Check neighbors (4-connected)
            const neighbors = [
              {x: cell.x - 1, y: cell.y},
              {x: cell.x + 1, y: cell.y},
              {x: cell.x, y: cell.y - 1},
              {x: cell.x, y: cell.y + 1}
            ];
            
            for (const neighbor of neighbors) {
              if (neighbor.x >= 0 && neighbor.x < gridSize && 
                  neighbor.y >= 0 && neighbor.y < gridSize &&
                  darkCells[neighbor.y][neighbor.x] && 
                  !visited[neighbor.y][neighbor.x]) {
                visited[neighbor.y][neighbor.x] = true;
                queue.push(neighbor);
              }
            }
          }
          
          // Calculate region bounds
          let minRegionX = gridSize;
          let minRegionY = gridSize;
          let maxRegionX = 0;
          let maxRegionY = 0;
          
          for (const cell of regionCells) {
            if (cell.x < minRegionX) minRegionX = cell.x;
            if (cell.y < minRegionY) minRegionY = cell.y;
            if (cell.x > maxRegionX) maxRegionX = cell.x;
            if (cell.y > maxRegionY) maxRegionY = cell.y;
          }
          
          regions.push({
            minX: minRegionX,
            minY: minRegionY,
            maxX: maxRegionX,
            maxY: maxRegionY,
            size: regionCells.length
          });
        }
      }
    }
    
    // Sort regions by size (largest first)
    regions.sort((a, b) => b.size - a.size);
    
    // If no significant regions found, this may not be a riven card
    if (regions.length === 0 || regions[0].size < 10) {
      logger.warn(`No significant dark regions found, may not be a riven card`);
      return null;
    }
    
    // Use the largest region as the riven card
    const largestRegion = regions[0];
    
    // Convert grid coordinates back to image pixels
    const minX = largestRegion.minX * cellWidth;
    const minY = largestRegion.minY * cellHeight;
    const maxX = (largestRegion.maxX + 1) * cellWidth;
    const maxY = (largestRegion.maxY + 1) * cellHeight;
    
    // Add padding
    const paddingX = Math.floor((maxX - minX) * 0.15);
    const paddingY = Math.floor((maxY - minY) * 0.20);
    
    const cropMinX = Math.max(0, minX - paddingX);
    const cropMinY = Math.max(0, minY - paddingY * 2.5);
    const cropMaxX = Math.min(resizedWidth, maxX + paddingX);
    const cropMaxY = Math.min(resizedHeight, maxY + paddingY);
    
    const cropWidth = cropMaxX - cropMinX;
    const cropHeight = cropMaxY - cropMinY;
    
    // Scale back to original image dimensions
    const scaleX = width / resizedWidth;
    const scaleY = height / resizedHeight;
    
    const originalMinX = Math.floor(cropMinX * scaleX);
    const originalMinY = Math.floor(cropMinY * scaleY);
    const originalCropWidth = Math.floor(cropWidth * scaleX);
    const originalCropHeight = Math.floor(cropHeight * scaleY);
    
    logger.info(`Cropping riven card by background at coordinates: x=${originalMinX}, y=${originalMinY}, width=${originalCropWidth}, height=${originalCropHeight}`);
    
    // Crop the original image and save
    await sharp(inputImagePath)
      .extract({
        left: originalMinX,
        top: originalMinY,
        width: originalCropWidth,
        height: originalCropHeight
      })
      .toFile(croppedFilePath);
    
    logger.info(`Successfully cropped riven card by background to ${croppedFilePath}`);
    return croppedFilePath;
  } catch (error) {
    logger.error(`Error detecting and cropping riven by background: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * More precise detection focusing specifically on the dark stats area with stats text
 * @param inputImagePath Path to the input image
 * @returns Path to the cropped image or null if detection failed
 */
export async function detectAndCropRivenStatsArea(inputImagePath: string): Promise<string | null> {
  try {
    logger.info(`Attempting to detect and crop riven stats area from ${inputImagePath}`);
    
    // Create output file path
    const croppedFilePath = path.join(os.tmpdir(), `riven-stats-${Date.now()}.png`);
    
    // Get image metadata
    const metadata = await sharp(inputImagePath).metadata();
    const { width, height } = metadata;
    
    if (!width || !height) {
      logger.warn(`Could not get image dimensions for ${inputImagePath}`);
      return null;
    }
    
    // Convert image to RGB and get pixel data
    const { data, info } = await sharp(inputImagePath)
      .resize({ width: Math.min(width, 800), height: Math.min(height, 800), fit: 'inside' }) // Downsample for faster processing
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const resizedWidth = info.width;
    const resizedHeight = info.height;
    
    // First detect the purple pixels to find the overall card area
    const purplePixels: { x: number, y: number }[] = [];
    for (let y = 0; y < resizedHeight; y++) {
      for (let x = 0; x < resizedWidth; x++) {
        const idx = (y * resizedWidth + x) * 3; // RGB format (3 channels)
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if this pixel is in the purple range of riven borders
        if (r >= RIVEN_COLORS.border.purple.r.min && r <= RIVEN_COLORS.border.purple.r.max &&
            g >= RIVEN_COLORS.border.purple.g.min && g <= RIVEN_COLORS.border.purple.g.max &&
            b >= RIVEN_COLORS.border.purple.b.min && b <= RIVEN_COLORS.border.purple.b.max) {
          purplePixels.push({ x, y });
        }
      }
    }
    
    // If we didn't find enough purple pixels, this may not be a riven card
    if (purplePixels.length < 100) {
      logger.warn(`Not enough purple border pixels found (${purplePixels.length}), may not be a riven card`);
      return null;
    }
    
    // Find bounding box of purple pixels
    let minX = resizedWidth;
    let minY = resizedHeight;
    let maxX = 0;
    let maxY = 0;
    
    for (const pixel of purplePixels) {
      if (pixel.x < minX) minX = pixel.x;
      if (pixel.y < minY) minY = pixel.y;
      if (pixel.x > maxX) maxX = pixel.x;
      if (pixel.y > maxY) maxY = pixel.y;
    }
    
    // Now within the purple border area, find the dark stats background region
    // Stats area typically occupies the bottom 40-60% of the card
    const cardHeight = maxY - minY;
    const statsAreaStartY = minY + Math.floor(cardHeight * 0.4); // Start looking from ~40% down the card
    
    // Count dark pixels in each row to find the stats area
    const darkPixelsByRow: number[] = new Array(maxY - statsAreaStartY + 1).fill(0);
    for (let y = statsAreaStartY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * resizedWidth + x) * 3;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check for very dark pixels - stats background is almost black
        if (r <= 40 && g <= 40 && b <= 40) {
          darkPixelsByRow[y - statsAreaStartY]++;
        }
      }
    }
    
    // Find the start of stats area - the first row with a significant number of dark pixels
    // The dark background of stats area should have at least 60% of the width as dark pixels
    const darkThreshold = Math.floor((maxX - minX) * 0.6);
    let statsStartY = -1;
    let statsEndY = -1;
    
    // Find start of stats area
    for (let i = 0; i < darkPixelsByRow.length; i++) {
      if (darkPixelsByRow[i] >= darkThreshold) {
        statsStartY = statsAreaStartY + i;
        break;
      }
    }
    
    // Find end of stats area - the last row with significant dark pixels
    for (let i = darkPixelsByRow.length - 1; i >= 0; i--) {
      if (darkPixelsByRow[i] >= darkThreshold) {
        statsEndY = statsAreaStartY + i;
        break;
      }
    }
    
    // If we couldn't find a clear stats area, use the bottom half of the card as fallback
    if (statsStartY === -1 || statsEndY === -1) {
      logger.warn(`Could not identify exact stats area boundaries, using fallback estimate`);
      statsStartY = minY + Math.floor(cardHeight * 0.5); // Take bottom half
      statsEndY = maxY - Math.floor(cardHeight * 0.05); // Leave small margin at bottom
    }
    
    // Make sure to include some area above the stats start to capture weapon name
    // Increase this margin to ensure we capture the weapon name at the top
    statsStartY = Math.max(minY, statsStartY - Math.floor(cardHeight * 0.3)); // Increased from 0.1 to 0.3
    
    // Scale the crop back to original image dimensions
    const scaleX = width / resizedWidth;
    const scaleY = height / resizedHeight;
    
    const originalMinX = Math.floor(minX * scaleX);
    const originalStatsStartY = Math.floor(statsStartY * scaleY);
    const originalCropWidth = Math.floor((maxX - minX) * scaleX);
    const originalCropHeight = Math.floor((statsEndY - statsStartY) * scaleY);
    
    logger.info(`Cropping riven stats area at coordinates: x=${originalMinX}, y=${originalStatsStartY}, width=${originalCropWidth}, height=${originalCropHeight}`);
    
    // Crop the original image and save
    await sharp(inputImagePath)
      .extract({
        left: originalMinX,
        top: originalStatsStartY,
        width: originalCropWidth,
        height: originalCropHeight
      })
      .toFile(croppedFilePath);
    
    logger.info(`Successfully cropped riven stats area to ${croppedFilePath}`);
    return croppedFilePath;
  } catch (error) {
    logger.error(`Error detecting and cropping riven stats area: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Try multiple methods to detect and crop a riven card from an image
 * @param inputImagePath Path to the input image
 * @returns Path to the cropped image or the original image if detection failed
 */
export async function tryDetectAndCropRiven(inputImagePath: string): Promise<string> {
  // First try the more precise stats area detection
  const statsAreaResult = await detectAndCropRivenStatsArea(inputImagePath);
  if (statsAreaResult) {
    return statsAreaResult;
  }
  
  // If that fails, try detecting by purple border
  const purpleBorderResult = await detectAndCropRivenCard(inputImagePath);
  if (purpleBorderResult) {
    return purpleBorderResult;
  }
  
  // If that fails, try detecting by background
  const backgroundResult = await detectRivenByBackground(inputImagePath);
  if (backgroundResult) {
    return backgroundResult;
  }
  
  // If all detection methods fail, return the original image
  logger.warn(`Could not detect riven card in ${inputImagePath}, using original image`);
  return inputImagePath;
} 