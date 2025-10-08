import { ChatInputCommandInteraction, Collection, MessageFlags } from 'discord.js';
import { config } from '../config/config';
import { createEmbed } from './embedBuilder';

// Format for storing cooldowns: userId-commandName -> timestamp
const cooldowns = new Collection<string, number>();

/**
 * Check if a command is on cooldown for a user
 * @returns true if command can proceed, false if on cooldown
 */
export function handleCooldown(
  interaction: ChatInputCommandInteraction,
  cooldownSeconds: number
): boolean {
  // If cooldowns are disabled in config, skip the check
  if (!config.ENABLE_COOLDOWNS) {
    return true;
  }
  
  const userId = interaction.user.id;
  const commandName = interaction.commandName;
  const key = `${userId}-${commandName}`;
  
  // Current timestamp in seconds
  const now = Math.floor(Date.now() / 1000);
  
  // Get the cooldown expiration time
  const expirationTime = cooldowns.get(key);
  
  // If command is not on cooldown or cooldown has expired
  if (!expirationTime || now >= expirationTime) {
    // Set a new cooldown
    cooldowns.set(key, now + cooldownSeconds);
    return true;
  }
  
  // Calculate remaining time
  const timeLeft = expirationTime - now;
  
  // Create a cooldown embed response
  const cooldownEmbed = createEmbed({
    type: 'warning',
    title: 'Command on Cooldown',
    description: `Please wait ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before using \`/${commandName}\` again.`,
    timestamp: true,
  });
  
  // Reply with the cooldown message
  interaction.reply({
    embeds: [cooldownEmbed],
    ephemeral: true
  }).catch(console.error);
  
  return false;
}

/**
 * Clear a specific command cooldown for a user
 */
export function clearCooldown(userId: string, commandName: string): boolean {
  const key = `${userId}-${commandName}`;
  return cooldowns.delete(key);
}

/**
 * Clear all cooldowns for a specific user
 */
export function clearUserCooldowns(userId: string): number {
  let count = 0;
  
  cooldowns.forEach((_, key) => {
    if (key.startsWith(`${userId}-`)) {
      cooldowns.delete(key);
      count++;
    }
  });
  
  return count;
}

/**
 * Get all active cooldowns
 */
export function getActiveCooldowns(): Collection<string, number> {
  const now = Math.floor(Date.now() / 1000);
  const active = new Collection<string, number>();
  
  cooldowns.forEach((expiration, key) => {
    if (expiration > now) {
      active.set(key, expiration);
    }
  });
  
  return active;
} 