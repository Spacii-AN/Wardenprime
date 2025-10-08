import { spawn } from 'child_process';
import { logger } from './utils/logger';

/**
 * Utility script for starting the bot in development mode
 * The main index.ts file now handles command registration automatically
 */
function startDevBot() {
  logger.info('🚀 Starting bot in development mode...');
  logger.info('ℹ️ Commands will be automatically registered on startup');
  
  // Use spawn to create a new process that runs the bot
  const botProcess = spawn('ts-node', ['src/index.ts'], {
    stdio: 'inherit', // This passes all stdio to the parent process
    shell: true
  });
  
  // Handle process events
  botProcess.on('error', (err) => {
    logger.error('❌ Failed to start bot process:', err);
    process.exit(1);
  });
  
  // Forward signals to child process
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, forwarding to bot process...');
    botProcess.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, forwarding to bot process...');
    botProcess.kill('SIGTERM');
  });
  
  // Handle exit
  botProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logger.error(`Bot process exited with code ${code}`);
      process.exit(code);
    }
  });
}

// Execute the process
startDevBot(); 