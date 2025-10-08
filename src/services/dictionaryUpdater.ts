import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';
import { dictionaryEvents } from '../utils/dictionaryLoader';

// GitHub repository information
const REPO_OWNER = 'calamity-inc';
const REPO_NAME = 'warframe-public-export-plus';
const BRANCH = 'senpai'; // The branch to pull from
const REPO_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// Configuration
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const DICT_DIR = path.join(process.cwd(), 'dict');

// GitHub API authentication token (optional but recommended)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Rate limiting configuration
const MAX_REQUESTS_PER_HOUR = GITHUB_TOKEN ? 1000 : 50; // 1000 with token, much less without to be safe
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests minimum
const RATE_LIMIT_RESET_BUFFER = 5000; // 5 second buffer when handling rate limits

// Tracking state
let isUpdating = false;
let lastUpdateTime = 0;
let updateInterval: NodeJS.Timeout | null = null;
let requestCount = 0;
let requestResetTime = Date.now() + 3600000; // Initialize with 1 hour from now
let lastRequestTime = 0;
let etags: Record<string, string> = {}; // Store ETags for conditional requests

/**
 * Start the dictionary updater service
 */
export function startDictionaryUpdater(): void {
  logger.info('Starting dictionary updater service');
  
  // Load stored ETags if available
  loadETags();
  
  // Start with a delay to avoid hammering GitHub right at startup
  setTimeout(() => {
    // Create initial update
    updateDictionaries();
    
    // Schedule regular updates
    updateInterval = setInterval(updateDictionaries, UPDATE_INTERVAL);
  }, 5 * 60 * 1000); // Wait 5 minutes after startup
}

/**
 * Load stored ETags from file
 */
async function loadETags(): Promise<void> {
  try {
    const etagFile = path.join(DICT_DIR, '.etags.json');
    const exists = await fs.access(etagFile).then(() => true).catch(() => false);
    
    if (exists) {
      const data = await fs.readFile(etagFile, 'utf8');
      etags = JSON.parse(data);
      logger.info(`Loaded ${Object.keys(etags).length} ETags for conditional requests`);
    }
  } catch (error) {
    logger.warn('Failed to load ETags file, will start fresh', error);
    etags = {};
  }
}

/**
 * Save ETags to file
 */
async function saveETags(): Promise<void> {
  try {
    const etagFile = path.join(DICT_DIR, '.etags.json');
    await fs.writeFile(etagFile, JSON.stringify(etags, null, 2), 'utf8');
    logger.debug(`Saved ${Object.keys(etags).length} ETags for future requests`);
  } catch (error) {
    logger.warn('Failed to save ETags file', error);
  }
}

/**
 * Stop the dictionary updater service
 */
export function stopDictionaryUpdater(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  logger.info('Dictionary updater service stopped');
  
  // Save ETags when stopping
  saveETags();
}

/**
 * Manually trigger a dictionary update
 */
export async function triggerDictionaryUpdate(): Promise<boolean> {
  if (isUpdating) {
    logger.warn('Dictionary update already in progress, skipping manual trigger');
    return false;
  }
  
  return updateDictionaries();
}

/**
 * Handle rate limiting for GitHub API requests
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Ensure minimum interval between requests
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  // Check if we're approaching the rate limit
  if (requestCount >= MAX_REQUESTS_PER_HOUR) {
    const timeUntilReset = requestResetTime - Date.now();
    
    if (timeUntilReset > 0) {
      logger.warn(`Rate limit reached (${requestCount}/${MAX_REQUESTS_PER_HOUR}), waiting ${Math.ceil(timeUntilReset/1000)} seconds until reset`);
      await new Promise(resolve => setTimeout(resolve, timeUntilReset + RATE_LIMIT_RESET_BUFFER));
      
      // Reset the counter after waiting
      requestCount = 0;
      requestResetTime = Date.now() + 3600000; // 1 hour from now
    }
  }
  
  lastRequestTime = Date.now();
}

/**
 * Update rate limit tracking from GitHub API response headers
 */
function updateRateLimitInfo(headers: any): void {
  if (headers['x-ratelimit-remaining'] !== undefined) {
    const remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    const limit = parseInt(headers['x-ratelimit-limit'], 10);
    const reset = parseInt(headers['x-ratelimit-reset'], 10) * 1000; // Convert to milliseconds
    
    // Update our tracking
    requestCount = limit - remaining;
    requestResetTime = reset;
    
    logger.debug(`GitHub API rate limit: ${remaining}/${limit} remaining, resets at ${new Date(reset).toISOString()}`);
  }
}

/**
 * Make a rate-limited GitHub API request with proper error handling
 */
async function githubApiRequest(url: string, options: any = {}): Promise<any> {
  // Wait for rate limit if needed
  await waitForRateLimit();
  
  // Prepare headers
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'KorptairBot/1.0.0',
    ...options.headers
  };
  
  // Add authorization if token is available
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  
  // Add conditional request header if we have an ETag
  if (etags[url]) {
    headers['If-None-Match'] = etags[url];
  }
  
  try {
    const response = await axios.get(url, {
      ...options,
      headers,
      validateStatus: (status) => status < 500 // Don't throw on 304 (Not Modified)
    });
    
    // Update rate limit info
    updateRateLimitInfo(response.headers);
    
    // Store ETag for future requests
    if (response.headers.etag) {
      etags[url] = response.headers.etag;
    }
    
    // Handle rate limit exceeded
    if (response.status === 403 && response.data.message && response.data.message.includes('rate limit exceeded')) {
      const resetTime = parseInt(response.headers['x-ratelimit-reset'], 10) * 1000;
      const waitTime = resetTime - Date.now() + RATE_LIMIT_RESET_BUFFER;
      
      logger.warn(`GitHub API rate limit exceeded, waiting ${Math.ceil(waitTime/1000)} seconds until reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Retry the request
      return githubApiRequest(url, options);
    }
    
    // Handle Not Modified (304)
    if (response.status === 304) {
      return { notModified: true };
    }
    
    // Handle unexpected status codes
    if (response.status !== 200) {
      logger.warn(`GitHub API returned unexpected status code: ${response.status}`, {
        url,
        status: response.status,
        statusText: response.statusText,
        message: response.data && response.data.message ? response.data.message : 'No message'
      });
      return { error: true, status: response.status, message: response.data?.message || response.statusText };
    }
    
    // Verify data exists and has expected format
    if (!response.data) {
      logger.warn(`GitHub API response missing data property for ${url}`);
      return { error: true, message: 'Response missing data property' };
    }
    
    return response;
  } catch (error) {
    // Handle network errors with exponential backoff
    if (axios.isAxiosError(error) && !error.response) {
      const retryDelay = Math.min(30000, Math.pow(2, requestCount % 10) * 1000);
      logger.warn(`Network error accessing GitHub API, retrying in ${retryDelay/1000} seconds`, error);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Retry the request
      return githubApiRequest(url, options);
    }
    
    throw error;
  }
}

/**
 * Check if a file needs updating by comparing ETags and SHAs
 */
async function shouldUpdateFile(filename: string): Promise<boolean> {
  try {
    // Get file info from GitHub API
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filename}?ref=${BRANCH}`;
    const response = await githubApiRequest(apiUrl);
    
    // If we got a 304 Not Modified response, the file hasn't changed
    if (response.notModified) {
      logger.debug(`File ${filename} not modified since last check (ETag match)`);
      return false;
    }
    
    // Check for errors in the response
    if (response.error) {
      logger.warn(`Error checking file ${filename}: ${response.message}`);
      return false;
    }
    
    // Check if response data contains the required SHA
    if (!response.data || !response.data.sha) {
      logger.warn(`GitHub API response for ${filename} is missing SHA information`);
      return false;
    }
    
    const githubSha = response.data.sha;
    
    // Check if file exists locally
    const localFilePath = path.join(DICT_DIR, filename);
    try {
      const fileStats = await fs.stat(localFilePath);
      
      // If we have the file already, only update if it's different
      if (fileStats.isFile()) {
        const fileContent = await fs.readFile(localFilePath);
        const localSha = createHash('sha1').update(`blob ${fileContent.length}\0${fileContent}`).digest('hex');
        
        return localSha !== githubSha;
      }
    } catch (err) {
      // File doesn't exist locally
      return true;
    }
    
    return true;
  } catch (error) {
    logger.error(`Error checking file ${filename}:`, error);
    return false;
  }
}

/**
 * Download file from GitHub to dictionary directory
 */
async function downloadFile(filename: string): Promise<boolean> {
  try {
    const url = `${REPO_RAW_URL}/${filename}`;
    const response = await axios.get(url, { responseType: 'text' });
    
    const filePath = path.join(DICT_DIR, filename);
    
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file directly to dictionary directory
    await fs.writeFile(filePath, response.data);
    
    logger.info(`Successfully downloaded ${filename}`);
    return true;
  } catch (error) {
    logger.error(`Error downloading ${filename}:`, error);
    return false;
  }
}

/**
 * Validate a downloaded dictionary file (check if it's valid JSON)
 */
async function validateFile(filename: string): Promise<boolean> {
  try {
    const filePath = path.join(DICT_DIR, filename);
    const content = await fs.readFile(filePath, 'utf8');
    
    // Try to parse as JSON
    JSON.parse(content);
    return true;
  } catch (error) {
    logger.error(`Invalid dictionary file ${filename}:`, error);
    return false;
  }
}

/**
 * Verify file was successfully installed in the dictionary directory
 */
async function installFile(filename: string): Promise<boolean> {
  try {
    // Since we download directly to DICT_DIR, we just need to verify the file exists
    const filePath = path.join(DICT_DIR, filename);
    await fs.access(filePath);
    
    logger.info(`Successfully updated dictionary file: ${filename}`);
    return true;
  } catch (error) {
    logger.error(`Error verifying file ${filename}:`, error);
    return false;
  }
}

/**
 * List all dictionary files in the GitHub repository
 */
async function listDictionaryFiles(): Promise<string[]> {
  try {
    // Get repo contents from GitHub API
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents?ref=${BRANCH}`;
    const response = await githubApiRequest(apiUrl);
    
    // Check if response or response.data is undefined or not an array
    if (!response || !response.data || !Array.isArray(response.data)) {
      logger.warn(`Unexpected GitHub API response for ${apiUrl}`, { 
        hasResponse: !!response, 
        hasData: !!(response && response.data),
        dataType: response && response.data ? typeof response.data : 'undefined'
      });
      return [];
    }
    
    // Filter for only the dictionary files we need:
    // - dict.en.json (English only)
    // - All Export*.json files
    const fileList = response.data
      .filter((item: any) => item.type === 'file' && (
        item.name === 'dict.en.json' || 
        item.name.startsWith('Export')
      ))
      .map((item: any) => item.name);
    
    logger.info(`Found ${fileList.length} relevant dictionary files to process`);
    return fileList;
  } catch (error) {
    logger.error('Error listing dictionary files from GitHub:', error);
    return [];
  }
}

/**
 * Main function to update all dictionaries
 */
async function updateDictionaries(): Promise<boolean> {
  if (isUpdating) {
    logger.warn('Dictionary update already in progress, skipping');
    return false;
  }
  
  isUpdating = true;
  let success = true;
  
  try {
    logger.info('Starting dictionary update from GitHub');
    
    // Create dictionary directory if it doesn't exist
    await fs.mkdir(DICT_DIR, { recursive: true });
    
    // Get list of dictionary files
    const files = await listDictionaryFiles();
    
    if (!files || files.length === 0) {
      logger.warn('No dictionary files found to update. Skipping update process.');
      return false;
    }
    
    logger.info(`Found ${files.length} dictionary files to check for updates`);
    
    // Track updated and failed files
    const updatedFiles: string[] = [];
    const failedFiles: string[] = [];
    
    // Process files in smaller batches to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(files.length/BATCH_SIZE)} (${batch.length} files)`);
      
      // Process files in this batch
      for (const filename of batch) {
        // Check if file needs updating
        const needsUpdate = await shouldUpdateFile(filename);
        
        if (needsUpdate) {
          logger.info(`Updating dictionary file: ${filename}`);
          
          // Download -> Validate -> Install
          const downloaded = await downloadFile(filename);
          if (!downloaded) {
            failedFiles.push(filename);
            continue;
          }
          
          const valid = await validateFile(filename);
          if (!valid) {
            failedFiles.push(filename);
            continue;
          }
          
          const installed = await installFile(filename);
          if (installed) {
            updatedFiles.push(filename);
          } else {
            failedFiles.push(filename);
          }
        }
      }
      
      // Add a small delay between batches
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Save ETags for future requests
    await saveETags();
    
    // Log summary
    logger.info(`Dictionary update complete. Updated ${updatedFiles.length} files. Failed: ${failedFiles.length} files.`);
    if (failedFiles.length > 0) {
      logger.warn(`Failed to update files: ${failedFiles.join(', ')}`);
      success = false;
    }
    
    // Emit event to refresh dictionary cache if files were updated
    if (updatedFiles.length > 0) {
      logger.info(`Emitting dictionaryUpdated event for ${updatedFiles.length} files`);
      dictionaryEvents.emit('dictionaryUpdated', updatedFiles);
    }
    
    lastUpdateTime = Date.now();
  } catch (error) {
    logger.error('Error updating dictionaries:', error);
    success = false;
  } finally {
    isUpdating = false;
  }
  
  return success;
}

/**
 * Get status information about the dictionary updater
 */
export function getDictionaryUpdaterStatus(): {
  isUpdating: boolean;
  lastUpdateTime: number;
  nextUpdateTime: number;
  rateLimit: {
    remaining: number;
    total: number;
    resetTime: number;
  }
} {
  return {
    isUpdating,
    lastUpdateTime,
    nextUpdateTime: lastUpdateTime + UPDATE_INTERVAL,
    rateLimit: {
      remaining: MAX_REQUESTS_PER_HOUR - requestCount,
      total: MAX_REQUESTS_PER_HOUR,
      resetTime: requestResetTime
    }
  };
} 