import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Log levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

// Get current log level from environment variable or config
const LOG_LEVEL = process.env.LOG_LEVEL 
  ? (LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.DEBUG)
  : (config.isDev ? LogLevel.DEBUG : LogLevel.INFO);

// Enable Discord debug logs only when explicitly set
const ENABLE_DISCORD_DEBUG = process.env.ENABLE_DISCORD_DEBUG === 'true' || false;

// Enable file logging only when explicitly set or in development mode
const ENABLE_FILE_LOGGING = process.env.ENABLE_FILE_LOGGING === 'true' || config.isDev;

// Ensure logs directory exists if file logging is enabled
let logsDir = '';
let logFilePath = '';

if (ENABLE_FILE_LOGGING) {
  logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Create log file for this session
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  logFilePath = path.join(logsDir, `bot-${timestamp}.log`);
}

/**
 * Enhanced logger utility for the Discord bot
 * Logs to console with colors and optionally to file with configurable log levels
 */
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.DEBUG) {
      const logMessage = `[DEBUG] ${message}`;
      console.debug(`${colors.dim}${colors.cyan}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  info: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.INFO) {
      const logMessage = `[INFO] ${message}`;
      console.log(`${colors.green}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.WARN) {
      const logMessage = `[WARN] ${message}`;
      console.warn(`${colors.yellow}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.ERROR) {
      const logMessage = `[ERROR] ${message}`;
      console.error(`${colors.red}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  critical: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.CRITICAL) {
      const logMessage = `[CRITICAL] ${message}`;
      console.error(`${colors.bright}${colors.bgRed}${colors.white}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  // Special methods for specific subsystems
  db: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.DEBUG) {
      const logMessage = `[DATABASE] ${message}`;
      console.log(`${colors.magenta}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  command: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.INFO) {
      const logMessage = `[COMMAND] ${message}`;
      console.log(`${colors.blue}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  },
  
  event: (message: string, ...args: any[]) => {
    if (LOG_LEVEL <= LogLevel.INFO) {
      const logMessage = `[EVENT] ${message}`;
      console.log(`${colors.cyan}${logMessage}${colors.reset}`, ...args);
      writeToLogFile(logMessage, args);
    }
  }
};

/**
 * Write log message to file
 */
function writeToLogFile(message: string, args: any[]) {
  // Skip file logging if disabled
  if (!ENABLE_FILE_LOGGING) {
    return;
  }
  
  try {
    const timestamp = new Date().toISOString();
    let logEntry = `${timestamp} ${message}`;
    
    // Format arguments for logging - only include essential info
    if (args.length > 0) {
      // For error objects, extract the stack trace
      const formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return arg.stack || arg.toString();
        }
        // For objects, only stringify if not too large
        if (typeof arg === 'object' && arg !== null) {
          try {
            const str = JSON.stringify(arg);
            // Only include short object representations
            return str.length > 500 ? '[Object - large]' : str;
          } catch (e) {
            return '[Object - not serializable]';
          }
        }
        return arg;
      });
      logEntry += ` ${formattedArgs.join(' ')}`;
    }
    
    // Append to log file
    fs.appendFileSync(logFilePath, logEntry + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
} 