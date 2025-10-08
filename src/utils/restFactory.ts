import { REST } from '@discordjs/rest';
import { config } from '../config/config';

// Singleton REST instance for global use
let globalRestInstance: REST | null = null;

export function getRestInstance(): REST {
  if (!globalRestInstance) {
    globalRestInstance = new REST({ 
      version: '10', 
      timeout: 60000
    }).setToken(config.BOT_TOKEN);
  }
  return globalRestInstance;
} 