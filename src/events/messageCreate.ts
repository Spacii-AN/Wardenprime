import { Message, Events, ChannelType, TextChannel, ThreadAutoArchiveDuration, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ThreadChannel, Client, MessageType, AttachmentBuilder, Collection, DiscordAPIError, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';
import { createEmbed } from '../utils/embedBuilder';
import path from 'path';
import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import * as os from 'os';
import * as util from 'util';
import * as stream from 'stream';
import sharp from 'sharp';
import FormData from 'form-data';
import { formatDuration } from '../utils/formatDuration';

// Define interface for weapon entries from the autograde module
interface WeaponMapEntry {
  name: string;
  internalPath: string;
  category: string;
  disposition: number;
  rivenType: string;
}

const pipeline = util.promisify(stream.pipeline);

// --- Load weapon lists dynamically instead of hardcoding ---
let KNOWN_WEAPONS: string[] = [];

// Load known weapons from weaponLookup.json
async function loadKnownWeapons(): Promise<void> {
  try {
    const weaponLookupPath = path.join(process.cwd(), 'dict', 'weaponLookup.json');
    const weaponData = await fs.readFile(weaponLookupPath, 'utf8');
    const weaponLookup = JSON.parse(weaponData);
    
    // Extract weapon names from the keys of the weaponLookup object
    KNOWN_WEAPONS = Object.keys(weaponLookup).map(name => 
      name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    );
    
    logger.info(`[MessageCreate] Loaded ${KNOWN_WEAPONS.length} weapons from weaponLookup.json`);
  } catch (err) {
    logger.error(`[MessageCreate] Error loading weaponLookup.json: ${err}`);
    // Fallback to a basic list if we can't load the file
    KNOWN_WEAPONS = [
      'Dual Toxocyst', 'Furis', 'Braton', 'Latron', 'Strun', 'Boar', 'Grakata', 'Boltor', 'Soma', 'Paris', 'Cernos', 
      'Dread', 'Hek', 'Sobek', 'Tigris', 'Sybaris', 'Opticor', 'Lanka', 'Rubico', 'Vectis', 'Snipetron', 'Kohm', 
      'Ignis', 'Amprex', 'Flux Rifle', 'Glaxion', 'Quanta', 'Penta', 'Tonkor', 'Torid', 'Ogris', 'Acceltra', 'Fulmin'
    ];
    logger.info(`[MessageCreate] Using fallback weapon list with ${KNOWN_WEAPONS.length} entries`);
  }
}

// Load weapons on module initialization
loadKnownWeapons();

// --- Helper Function for Weapon Name Extraction ---
function extractBestWeaponName(ocrText: string): string {
  if (!ocrText) return 'Unknown Weapon';
  const lowerText = ocrText.toLowerCase();
  const words = lowerText.split(' ');

  // Use KNOWN_WEAPONS instead of hardcoded KNOWN_BASE_WEAPONS
  for (const baseWeapon of KNOWN_WEAPONS) {
    const lowerBase = baseWeapon.toLowerCase();
    const baseWords = lowerBase.split(' ');
    
    let startIndex = -1;
    for (let i = 0; i <= words.length - baseWords.length; i++) {
      let match = true;
      for (let j = 0; j < baseWords.length; j++) {
        if (words[i + j] !== baseWords[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        startIndex = i;
        break;
      }
    }

    if (startIndex !== -1) {
      const originalWords = ocrText.split(' ');
      const endIndex = Math.min(startIndex + baseWords.length + 3, originalWords.length);
      const potentialName = originalWords.slice(startIndex, endIndex).join(' ').trim();
      
      // Refined cleanup: Match the start of the string for valid weapon characters
      const nameMatch = potentialName.match(/^([a-zA-Z0-9]+(?:[ -][a-zA-Z0-9]+)*)/);
      
      if (nameMatch && nameMatch[1]) {
        let refinedName = nameMatch[1];
        // Check if the matched name ends with a hyphen and if there might be more to append
        if (refinedName.endsWith('-')) {
          const remainingPotential = potentialName.substring(refinedName.length).trim();
          const nextWordMatch = remainingPotential.match(/^[a-zA-Z]+/); // Get the next word
          if (nextWordMatch && nextWordMatch[0]) {
            const nextWord = nextWordMatch[0];
            if (nextWord.length > 1 && nextWord.length < 10 && /[acrin]/.test(nextWord.toLowerCase())) {
              refinedName += nextWord;
              logger.debug(`[Alias] Appended likely suffix "${nextWord}" to weapon name.`);
            }
          }
        }
        logger.debug(`[Alias] Refined weapon name from "${potentialName}" to "${refinedName}"`);
        return refinedName;
      } else {
        logger.warn(`[Alias] Could not apply refined regex cleanup to potential name: ${potentialName}`);
        return potentialName.replace(/^[^a-zA-Z0-9-]+/, '').replace(/[^a-zA-Z0-9-]+$/, '').trim();
      }
    }
  }
  
  logger.warn(`[Alias] Could not find known base weapon in OCR text: ${ocrText}`);
  return ocrText.replace(/^[^a-zA-Z0-9-]+/, '').replace(/[^a-zA-Z0-9-]+$/, '').trim() || 'Unknown Weapon';
}
// --- End Helper Function ---

/**
 * Event handler for when a message is created
 * Handles LFG requests in designated channels
 */
export const name = Events.MessageCreate;
export const once = false;

export const execute: Event<typeof Events.MessageCreate>['execute'] = async (message: Message) => {
  // Ignore DMs, bot messages, and system messages
  if (!message.guild || message.author.bot || message.system) {
    return;
  }
  
  // Skip if PostgreSQL is not available
  if (!pgdb) {
    return;
  }
  
  try {
    // Get guild settings to check for LFG channel
    const guildSettings = await pgdb.getGuildSettings(message.guild.id);
    
    // If this message is in the LFG channel, process it as an LFG request
    if (guildSettings?.lfg_channel_id && message.channel.id === guildSettings.lfg_channel_id) {
      await handleLfgMessage(message);
    }
    
    // Check if this is a reply with + in an LFG thread
    if (message.channel.isThread() && message.content.trim().startsWith('+')) {
      await handlePlusMessage(message.client, message);
    }
  } catch (error) {
    logger.error(`Error handling message: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Handles a message in the LFG channel by creating a thread and setting up the LFG
 */
async function handleLfgMessage(message: Message) {
  try {
    // Extract the mission name from the message content
    let missionName = message.content.trim() || 'Untitled Mission';
    
    // Look for role mentions and replace them with the actual role name
    const roleMentions = message.mentions.roles;
    if (roleMentions.size > 0) {
      // Replace each role mention with its actual name
      roleMentions.forEach(role => {
        const roleMention = `<@&${role.id}>`;
        if (missionName.includes(roleMention)) {
          missionName = missionName.replace(roleMention, `@${role.name}`);
        }
      });
      
      logger.info(`Replaced role mentions in mission name: "${missionName}"`);
    }
    
    // Create a thread for this LFG - new format without player count in thread name
    const thread = await message.startThread({
      name: `[OPEN] - ${missionName.slice(0, 40)}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: `LFG request by ${message.author.tag}`
    });
    
    logger.info(`Created LFG thread for ${message.author.tag}: ${thread.name}`);
    
    // Create the LFG embed
    const lfgEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`LFG: ${missionName}`)
      .setDescription(`A new Looking For Group request has been created.`)
      .addFields(
        { name: '👤 Host Info', value: `**Host:** ${message.author}`, inline: false },
        { name: '👥 Players (1/4)', value: `1. ${message.author} (Host)`, inline: false },
        { name: '📌 Note', value: `**Use \`/close\` to end the thread, \`/full\` to mark as full (required for leaderboard progress), and anyone can join by typing \`+ [your in-game name]\` to increment the player count.**`, inline: false }
      )
      .setAuthor({
        name: ' ',
        iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
      })
      .setFooter({ text: `Commands can only be used by the host or moderators. This thread will be deleted after 1 hour of inactivity.` })
      .setTimestamp();
    
    // Create buttons for host commands
    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`lfg_full_${message.id}`)
          .setLabel('Mark as Full')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`lfg_close_${message.id}`)
          .setLabel('Close LFG')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
      );
    
    // Send the embed to the thread
    const lfgMessage = await thread.send({
      embeds: [lfgEmbed],
      components: [actionRow]
    });
    
    // Store the LFG session in the database
    if (pgdb) {
      const lfgSession = await pgdb.createLfgSession(
        message.guild!.id,
        message.channel.id,
        thread.id,
        lfgMessage.id,
        message.author.id,
        missionName
      );
      
      if (lfgSession) {
        // Add the host as a participant
        await pgdb.addLfgParticipant(lfgSession.id, message.author.id);
        logger.info(`LFG session added to database with ID: ${lfgSession.id}`);
      }
    }
    
  } catch (error) {
    logger.error(`Error creating LFG thread: ${error instanceof Error ? error.message : String(error)}`);
    
    // Try to notify the user of the error
    try {
      await message.reply({
        content: 'Sorry, I encountered an error while setting up your LFG request. Please try again or contact a server administrator.'
      });
    } catch (replyError) {
      logger.error(`Error replying to LFG message: ${replyError}`);
    }
  }
}

/**
 * Handle "+" messages to join an LFG
 * @param client Discord client
 * @param message The message to process
 * @returns boolean indicating if message was processed
 */
async function handlePlusMessage(client: Client, message: Message): Promise<boolean> {
  // Ignore non-LFG channel messages or bot messages
  if (!message.channel.isThread() || message.author.bot) {
    return false;
  }

  const thread = message.channel as ThreadChannel;
  
  // Only process the message if it's in a properly named LFG thread
  if (!thread.name.includes('[OPEN]')) {
    // If thread is marked FULL or CLOSED, respond to let the user know
    if (thread.name.includes('[FULL]')) {
      await message.reply({
        embeds: [
          createEmbed({
            type: 'warning',
            title: 'LFG is Full',
            description: 'This LFG session is already full and not accepting more players.',
            timestamp: true
          })
        ]
      });
    } else if (thread.name.includes('[CLOSED]')) {
      await message.reply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'LFG is Closed',
            description: 'This LFG session has been closed.',
            timestamp: true
          })
        ]
      });
    }
    return false;
  }
  
  // Check if the message starts with + (allowing for some whitespace)
  if (message.content.trim().startsWith('+')) {
    logger.info(`Found + message in thread ${thread.id} by ${message.author.tag}`);
    
    try {
      // Get current info about the LFG
      let currentPlayerCount = 1;
      let hostId = '';
      let lfgSession = null;
      
      // Attempt to get info from database
      if (pgdb) {
        lfgSession = await pgdb.getLfgSession(thread.id);
        if (lfgSession) {
          currentPlayerCount = lfgSession.player_count;
          hostId = lfgSession.host_id;
          logger.info(`Current player count from database: ${currentPlayerCount}, host: ${hostId}`);
        } else {
          logger.warn(`No LFG session found in database for thread ${thread.id}`);
        }
      }
      
      // If not from database, parse from thread name (this is for backward compatibility)
      if (!lfgSession) {
        // Try to find the current player count in the thread name
        const playerCountMatch = thread.name.match(/\[(\d)\/4\]/);
        if (playerCountMatch) {
          currentPlayerCount = parseInt(playerCountMatch[1], 10);
          logger.info(`Current player count from thread name: ${currentPlayerCount}`);
        }
        
        // Try to find the host from the thread starter message
        try {
          const starterMessage = await thread.fetchStarterMessage();
          hostId = starterMessage.author.id;
        } catch (error) {
          logger.warn(`Could not fetch starter message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Handle host adding players or trying to join
      let isHostAddingPlayer = false;
      let playerIGN = '';
      const messageContent = message.content.trim();
      
      if (messageContent.length > 1) {
        playerIGN = messageContent.substring(1).trim();
      }
        
      if (message.author.id === hostId) {
        // If the host didn't specify an IGN, they're just trying to join themselves
        if (!playerIGN) {
          await message.reply({
            embeds: [
              createEmbed({
                type: 'info',
                title: 'Host Notice',
                description: 'You are the host of this LFG and are already counted. No need to add a +',
                timestamp: true
              })
            ]
          });
          return true;
        }
        
        // If the host specified an IGN, they're adding another player manually
        isHostAddingPlayer = true;
        logger.info(`Host ${message.author.tag} is manually adding player with IGN: ${playerIGN}`);
      }
      // If no IGN provided for non-host player, use their Discord name
      else if (!playerIGN) {
        playerIGN = message.author.username;
      }
      
      // Track player data with IGNs
      type PlayerData = {
        id: string;
        name: string;
        ign: string;
        isHost: boolean;
        manuallyAdded?: boolean;
        addedAt?: number;
      };
      
      // Find players who have already joined
      const existingPlayers = new Map<string, PlayerData>();
      
      // Add host to the player list
      try {
        const hostMember = await message.guild?.members.fetch(hostId);
        existingPlayers.set(hostId, {
          id: hostId,
          name: hostMember?.user.tag || 'Unknown Host',
          ign: hostMember?.displayName || 'Unknown Host',
          isHost: true
        });
      } catch (error) {
        logger.warn(`Could not fetch host member: ${error instanceof Error ? error.message : String(error)}`);
        existingPlayers.set(hostId, {
          id: hostId,
          name: 'Unknown Host',
          ign: 'Unknown Host',
          isHost: true
        });
      }
      
      // Get recent messages to check who has already joined
      const messages = await thread.messages.fetch({ limit: 100 });
      const plusMessages = messages.filter(m => 
        !m.author.bot && 
        m.content.trim().startsWith('+') &&
        m.author.id !== hostId
      );
      
      // Get host additions - separate from regular joins
      const hostAdditions = messages.filter(m =>
        !m.author.bot &&
        m.author.id === hostId &&
        m.content.trim().startsWith('+') &&
        m.content.trim().length > 1 // Must have content after +
      );
      
      // Add existing players to our map
      for (const m of plusMessages.values()) {
        // Skip the current message
        if (m.id === message.id) continue;
        
        // Extract IGN from previous messages
        let ign = m.author.username;
        const content = m.content.trim();
        if (content.length > 1) {
          ign = content.substring(1).trim();
        }
        
        existingPlayers.set(m.author.id, {
          id: m.author.id,
          name: m.author.tag,
          ign: ign,
          isHost: false
        });
      }
      
      // Add manually added players from host
      let manualPlayerCount = 0;
      const manualPlayers: PlayerData[] = [];
      
      // Get only previous manually added players (not including the current message)
      for (const m of hostAdditions.values()) {
        // Skip the current message
        if (m.id === message.id) continue;
        
        // Extract IGN from host's message
        const content = m.content.trim();
        if (content.length > 1) {
          const ign = content.substring(1).trim();
          manualPlayerCount++;
          
          // Create a unique ID for each manually added player
          const manualId = `manual_${hostId}_${manualPlayerCount}`;
          
          const playerData = {
            id: manualId,
            name: 'Added by Host',
            ign: ign,
            isHost: false,
            manuallyAdded: true,
            addedAt: m.createdTimestamp // Track when added for sorting
          };
          
          manualPlayers.push(playerData);
          existingPlayers.set(manualId, playerData);
        }
      }
      
      // Sort manual players by when they were added (oldest first)
      manualPlayers.sort((a, b) => {
        return (a.addedAt || 0) - (b.addedAt || 0);
      });
      
      // Add the current manually added player AFTER sorting
      if (isHostAddingPlayer) {
        manualPlayerCount++;
        const manualId = `manual_${hostId}_${manualPlayerCount}`;
        
        const playerData = {
          id: manualId,
          name: 'Added by Host',
          ign: playerIGN,
          isHost: false,
          manuallyAdded: true,
          addedAt: message.createdTimestamp // Track when added for sorting
        };
        
        // Add to end of manualPlayers array to preserve order
        manualPlayers.push(playerData);
        existingPlayers.set(manualId, playerData);
      }
      
      // Prepare the sorted players array
      const playersArray: PlayerData[] = [];
      
      // Host always first
      const hostPlayer = Array.from(existingPlayers.values()).find(p => p.isHost);
      if (hostPlayer) {
        playersArray.push(hostPlayer);
      }
      
      // Then add all manually added players in order they were added
      playersArray.push(...manualPlayers);
      
      // Finally add any other players who joined themselves
      const selfJoinedPlayers = Array.from(existingPlayers.values())
        .filter(p => !p.isHost && !p.manuallyAdded);
        
      playersArray.push(...selfJoinedPlayers);
      
      // New player count is the size of the array (capped at 4 players)
      const newPlayerCount = Math.min(playersArray.length, 4);
      
      // Log message based on who added the player
      if (isHostAddingPlayer) {
        logger.info(`Host ${message.author.tag} manually added player with IGN ${playerIGN}, updating count from ${currentPlayerCount} to ${newPlayerCount}`);
      } else {
        logger.info(`Player ${message.author.tag} joined with IGN ${playerIGN}, updating count from ${currentPlayerCount} to ${newPlayerCount}`);
      }
      
      // First priority: Update the embed to reflect new player count
      try {
        const botMessages = messages.filter(m => m.author.id === client.user?.id && m.embeds.length > 0);
        
        if (botMessages.size > 0) {
          const lfgMessage = botMessages.first();
          if (lfgMessage && lfgMessage.embeds.length > 0) {
            const embed = EmbedBuilder.from(lfgMessage.embeds[0]);
            
            // Build the players list field
            let playersListValue = '';
            
            // Add all players in proper order
            for (let i = 0; i < Math.min(playersArray.length, 4); i++) {
              const player = playersArray[i];
              // Special format for manually added players
              if (player.manuallyAdded) {
                playersListValue += `${i + 1}. ${player.ign} (Added by Host)\n`;
              } else if (player.isHost) {
                playersListValue += `${i + 1}. ${player.name} (${player.ign}) - Host\n`;
              } else {
                playersListValue += `${i + 1}. ${player.name} (${player.ign})\n`;
              }
            }
            
            // If less than 4 players, add empty slots
            for (let i = playersArray.length; i < 4; i++) {
              playersListValue += `${i + 1}. Empty\n`;
            }
            
            // Update the player count field
            embed.spliceFields(1, 1, { 
              name: `👥 Players (${newPlayerCount}/4)`, 
              value: playersListValue, 
              inline: false 
            });
            
            // Edit the embed
            await lfgMessage.edit({ embeds: [embed] });
            logger.info(`Updated LFG embed with new player count: ${newPlayerCount}/4`);
          } else {
            logger.warn(`Could not find embed in LFG message`);
          }
        } else {
          logger.warn(`No bot messages found in thread ${thread.id}`);
        }
      } catch (embedError) {
        logger.error(`Error updating embed: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
      }
      
      // Second priority: Update the database if available
      if (pgdb && lfgSession) {
        try {
          await pgdb.updateLfgPlayerCount(lfgSession.id, newPlayerCount);
          logger.info(`Updated player count in database to ${newPlayerCount}`);
          
          // If this brings us to full, update status too
          if (newPlayerCount >= 4 && lfgSession.status === 'OPEN') {
            await pgdb.updateLfgSessionStatus(lfgSession.id, 'FULL');
            logger.info(`Updated session status to FULL in database`);
          }
        } catch (dbError) {
          logger.error(`Error updating database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      }
      
      // Update the thread name if needed
      if (newPlayerCount >= 4 && thread.name.includes('[OPEN]')) {
        try {
          // Extract mission name from current thread name
          const missionMatch = thread.name.match(/\[OPEN\](?:\s\[\d\/\d\])?\s-\s(.*)/);
          const missionName = missionMatch ? missionMatch[1] : "Unknown Mission";
          
          // Create new thread name without player count
          const newThreadName = `[FULL] - ${missionName}`;
          
          await thread.setName(newThreadName);
          logger.info(`Updated thread name to FULL status: ${newThreadName}`);
          
          // Also send a message to the thread announcing it's full
          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ LFG NOW FULL ⚠️')
                .setAuthor({
                  name: ' ',
                  iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
                })
                .setDescription(`This LFG session is now **FULL** with **4/4** players!`)
                .setTimestamp()
            ]
          });
        } catch (nameError) {
          logger.error(`Error updating thread name: ${nameError instanceof Error ? nameError.message : String(nameError)}`);
        }
      }
      
      // No confirmation messages - the embed update is enough
      
      return true;
    } catch (error) {
      logger.error(`Error processing + message: ${error instanceof Error ? error.message : String(error)}`);
      await message.reply({
        embeds: [
          createEmbed({
            type: 'error',
            title: 'Error',
            description: `An error occurred while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: true
          })
        ]
      });
      return false;
    }
  }
  
  return false;
}