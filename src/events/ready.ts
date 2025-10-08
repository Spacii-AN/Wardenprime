import { Client, Events } from 'discord.js';
import { logger } from '../utils/logger';
import { Event } from '../types/discord';
import { initArbitrationService } from '../services/arbitrationService';
import { startAyaService } from '../services/ayaService';
import { startFissureService } from '../services/fissureService';
import { startBaroService } from '../services/baroService';

// Event fired when the bot is ready
const ready: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount
    }));

    logger.info(`Bot is online! Logged in as ${client.user?.tag}`);
    logger.info(`Connected to ${guilds.length} guilds:`);
    
    guilds.forEach(guild => {
      logger.info(`- ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
    });
    
    // Initialize services
    try {
      // Start arbitration service
      logger.info('Initializing arbitration service...');
      await initArbitrationService(client);
      logger.info('Arbitration service initialized successfully');
      
      // Start Aya service
      logger.info('Starting Aya service...');
      startAyaService(client);
      logger.info('Aya service started successfully');
      
      // Start Fissure service
      logger.info('Starting Fissure service...');
      startFissureService(client);
      logger.info('Fissure service started successfully');
      
      // Start Baro Ki'Teer service
      logger.info('Starting Baro Ki\'Teer service...');
      startBaroService(client);
      logger.info('Baro Ki\'Teer service started successfully');
    } catch (error) {
      logger.error('Error initializing services:', error);
    }
  },
};

export = ready; 