#!/usr/bin/env ts-node

/**
 * Complete Database Initialization Script
 * This script creates ALL tables, columns, indexes, and default data in one go
 * No more running migrations every time!
 */

import { completeDatabaseInit } from '../services/completeDatabaseInit';
import { logger } from '../utils/logger';

async function runCompleteDatabaseInit() {
  try {
    logger.info('🚀 Starting COMPLETE database initialization...');
    logger.info('This will create ALL tables, columns, indexes, and default data');
    logger.info('No more migrations needed after this!');
    
    await completeDatabaseInit();
    
    logger.info('✅ Complete database initialization finished successfully!');
    logger.info('🎉 Your database is now fully configured and ready to use!');
    
  } catch (error) {
    logger.error('❌ Complete database initialization failed:', error);
    process.exit(1);
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  runCompleteDatabaseInit()
    .then(() => {
      logger.info('🎯 Complete database initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Complete database initialization script failed:', error);
      process.exit(1);
    });
}

export { runCompleteDatabaseInit };
