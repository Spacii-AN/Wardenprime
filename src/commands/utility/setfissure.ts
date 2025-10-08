import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  Role,
  Client
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { triggerFissureCheck } from '../../services/fissureService';

interface ActiveMission {
  _id: { $oid: string };
  Region: number;
  Seed: number;
  Activation: { $date: { $numberLong: string } };
  Expiry: { $date: { $numberLong: string } };
  Node: string;
  MissionType: string;
  Modifier: string;
  Hard: boolean;
}

// Mission types commonly available as fissures
const MISSION_TYPES = [
  'Survival',
  'Defense',
  'Exterminate',
  'Capture',
  'Rescue',
  'Sabotage',
  'Mobile Defense',
  'Spy',
  'Interception',
  'Excavation',
  'Disruption',
  'Void Cascade',
  'Void Flood',
  'Void Armageddon'
] as const;

type MissionType = typeof MISSION_TYPES[number];

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setfissure')
    .setDescription('Set up notifications for specific fissure mission types')
    .addStringOption(option => 
      option.setName('mission_type')
        .setDescription('Mission type to receive notifications for')
        .setRequired(true)
        .addChoices(
          { name: 'Survival', value: 'Survival' },
          { name: 'Defense', value: 'Defense' },
          { name: 'Exterminate', value: 'Exterminate' },
          { name: 'Capture', value: 'Capture' },
          { name: 'Rescue', value: 'Rescue' },
          { name: 'Sabotage', value: 'Sabotage' },
          { name: 'Mobile Defense', value: 'Mobile Defense' },
          { name: 'Spy', value: 'Spy' },
          { name: 'Interception', value: 'Interception' },
          { name: 'Excavation', value: 'Excavation' },
          { name: 'Disruption', value: 'Disruption' },
          { name: 'Void Cascade', value: 'Void Cascade' },
          { name: 'Void Flood', value: 'Void Flood' },
          { name: 'Void Armageddon', value: 'Void Armageddon' }
        ))
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('Role to ping when matching fissures are found')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('steel_path')
        .setDescription('Only notify for Steel Path fissures')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const missionType = interaction.options.getString('mission_type', true) as MissionType;
      const pingRole = interaction.options.getRole('ping_role');
      const steelPath = interaction.options.getBoolean('steel_path') || false;
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      
      // Standardize mission type for consistent comparison
      const standardizedType = missionType.charAt(0).toUpperCase() + missionType.slice(1);
      
      logger.debug(`Setting up fissure notification for ${missionType}, standardized as ${standardizedType}, Steel Path: ${steelPath}`);
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Check if a configuration already exists for this guild, mission type, and Steel Path setting
      const existingConfigs = await pgdb.getFissureNotifications();
      const existingMissionConfig = existingConfigs.filter(
        config => config.guild_id === guildId && 
                 config.mission_type === standardizedType && 
                 config.channel_id === channelId && 
                 config.steel_path === steelPath
      );
      
      if (existingMissionConfig.length > 0) {
        // Update existing configuration in PostgreSQL
        await pgdb.query(
          `UPDATE fissure_notifications 
           SET role_id = $1, updated_at = NOW() 
           WHERE id = $2`,
          [pingRole?.id || null, existingMissionConfig[0].id]
        );
        
        logger.info(`Updated fissure notification for guild ${guildId}, mission type ${missionType}, Steel Path: ${steelPath}`);
      } else {
        // Create new configuration in PostgreSQL
        await pgdb.addFissureNotification(
          guildId,
          channelId,
          standardizedType,
          steelPath,
          pingRole?.id || null
        );
        
        logger.info(`Set fissure notification for guild ${guildId}, mission type ${missionType}, Steel Path: ${steelPath}`);
      }
      
      // Check if this is a special mission type that needs special handling
      const isSpecialMissionType = standardizedType.includes('Void Cascade') || 
                                   standardizedType.includes('Void Flood') || 
                                   standardizedType.includes('Void Armageddon');
      
      if (isSpecialMissionType) {
        // For special mission types, ensure we fully reset the cache in fissureService
        // to force detection of these mission types regardless of previous state
        try {
          const fissureService = await import('../../services/fissureService');
          if (typeof fissureService.resetFissureCacheForMissionType === 'function') {
            await fissureService.resetFissureCacheForMissionType(standardizedType);
            logger.info(`Reset fissure cache for special mission type: ${standardizedType}`);
          } else {
            // If the function doesn't exist yet, we need to force a full service reset
            // This is a bit of a hack, but necessary until the service is updated
            logger.warn(`The fissure service doesn't support targeted cache reset. Adding temporary hack to force detection.`);
            
            // Write a marker file to indicate this mission type should be force detected
            const fs = await import('fs/promises');
            const path = await import('path');
            const tempDir = path.join(process.cwd(), 'temp');
            
            try {
              await fs.mkdir(tempDir, { recursive: true });
              const markerFile = path.join(tempDir, `force_fissure_${guildId}_${channelId}_${standardizedType.replace(/\s+/g, '_')}.marker`);
              await fs.writeFile(markerFile, `Created at ${new Date().toISOString()}`);
              logger.info(`Created marker file to force fissure detection: ${markerFile}`);
            } catch (fsError) {
              logger.error('Error creating marker file:', fsError);
            }
          }
        } catch (importError) {
          logger.error('Error importing fissure service:', importError);
        }
      }
      
      // Send initial notification if there are active fissures of this type
      try {
        // Fetch current fissure data
        const response = await axios.get('https://oracle.browse.wf/worldState.json', {
          timeout: 10000,
          headers: {
            'User-Agent': 'KorptairBot/1.0.0'
          }
        });

        if (response.data?.ActiveMissions?.length > 0) {
          // Load dictionaries for translation
          const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
          const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, any>;
          
          const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
          const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
          
          // Filter void fissure missions
          const fissureMissions = response.data.ActiveMissions.filter((mission: any) => 
            mission.Modifier && mission.Modifier.startsWith('VoidT')
          );
          
          // Log some sample missions to debug
          if (fissureMissions.length > 0) {
            // Log important properties only, not the entire object
            const sampleMission = fissureMissions[0];
            logger.debug(`Sample fissure mission - Node: ${sampleMission.Node}, Type: ${sampleMission.MissionType}, Modifier: ${sampleMission.Modifier}, Hard: ${sampleMission.Hard}`);
            
            // Check if Hard property exists on missions
            const steelPathMissions = fissureMissions.filter((m: any) => m.Hard === true);
            logger.debug(`Found ${steelPathMissions.length} Steel Path missions out of ${fissureMissions.length} total`);
          }
          
          logger.debug(`Looking for missions of type: ${missionType}, standardized as ${standardizedType}`);
          
          // Try both direct comparison and more lenient matching
          let matchingFissures: any[] = [];
          
          // First try with strict lowercase comparison
          matchingFissures = fissureMissions.filter((mission: any) => {
            // Get mission type from region data
            const nodeInfo = regionsData[mission.Node];
            let currentMissionType = mission.MissionType; // Default
            
            if (nodeInfo?.missionName) {
              // Get translated name
              const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
              
              // Extract mission type
              const missionTypeParts = translatedName.split('_');
              if (missionTypeParts.length > 0) {
                currentMissionType = missionTypeParts[missionTypeParts.length - 1];
              }
            }
            
            // Clean up mission type name
            currentMissionType = currentMissionType.replace('MissionName_', '');
            
            // Handle special Zariman mission types
            if (currentMissionType === 'VoidCascade') currentMissionType = 'Void Cascade';
            if (currentMissionType === 'Corruption') currentMissionType = 'Void Flood';
            if (currentMissionType === 'Armageddon') currentMissionType = 'Void Armageddon';
            
            // Case insensitive comparison for mission types
            return currentMissionType.toLowerCase() === missionType.toLowerCase();
          });
          
          // If no matches found, try partial matching
          if (matchingFissures.length === 0) {
            logger.debug(`No exact matches found for ${missionType}, trying partial matching`);
            
            matchingFissures = fissureMissions.filter((mission: any) => {
              const nodeInfo = regionsData[mission.Node];
              let currentMissionType = mission.MissionType; // Default
              
              if (nodeInfo?.missionName) {
                const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
                const missionTypeParts = translatedName.split('_');
                if (missionTypeParts.length > 0) {
                  currentMissionType = missionTypeParts[missionTypeParts.length - 1];
                }
              }
              
              currentMissionType = currentMissionType.replace('MissionName_', '');
              
              // Special cases
              if (currentMissionType === 'VoidCascade') currentMissionType = 'Void Cascade';
              if (currentMissionType === 'Corruption') currentMissionType = 'Void Flood';
              if (currentMissionType === 'Armageddon') currentMissionType = 'Void Armageddon';
              
              // Try partial matching - check if either contains the other
              const missionLower = missionType.toLowerCase();
              const currentLower = currentMissionType.toLowerCase();
              return currentLower.includes(missionLower) || missionLower.includes(currentLower);
            });
          }
          
          logger.debug(`Found ${matchingFissures.length} potential matching missions for ${missionType}`);
          
          // Log mission types available
          const availableTypes = new Set<string>();
          fissureMissions.forEach((mission: any) => {
            const nodeInfo = regionsData[mission.Node];
            if (nodeInfo?.missionName) {
              const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
              availableTypes.add(translatedName);
            } else {
              availableTypes.add(mission.MissionType);
            }
          });
          
          logger.debug(`Available mission types: ${Array.from(availableTypes).join(', ')}`);
          
          // Filter by Steel Path if specified
          if (steelPath) {
            logger.debug(`Filtering for Steel Path missions, found ${matchingFissures.length} ${missionType} missions before filtering`);
            matchingFissures = matchingFissures.filter((mission: any) => mission.Hard);
            logger.debug(`After Steel Path filtering, found ${matchingFissures.length} missions`);
          } else {
            logger.debug(`Filtering for normal missions, found ${matchingFissures.length} ${missionType} missions before filtering`);
            matchingFissures = matchingFissures.filter((mission: any) => !mission.Hard);
            logger.debug(`After normal mission filtering, found ${matchingFissures.length} missions`);
          }
          
          if (matchingFissures.length > 0) {
            // There are matching fissures, send initial notification
            logger.info(`Found ${matchingFissures.length} ${missionType} ${steelPath ? 'Steel Path' : 'normal'} fissures, sending initial notification`);
            
            // Create a separate embed for each mission instead of a summary
            const channel = await interaction.guild?.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              const steelPathText = steelPath ? " Steel Path" : "";
              
              // Prepare role ping if configured - only ping once for the first message
              let content: string | null = null;
              if (pingRole) {
                content = `<@&${pingRole.id}> Current ${missionType}${steelPathText} fissures available!`;
              }
              
              // Send individual embeds for each mission
              for (let i = 0; i < matchingFissures.length; i++) {
                const mission = matchingFissures[i];
                const nodeInfo = regionsData[mission.Node];
                const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : mission.Node;
                const translatedSystem = nodeInfo?.systemName ? (langDict[nodeInfo.systemName] || nodeInfo.systemName) : 'Unknown';
                const factionName = nodeInfo?.factionName ? (langDict[nodeInfo.factionName] || nodeInfo.factionName) : 'Unknown';
                
                // Get mission type
                let missionTypeDisplay = mission.MissionType;
                if (nodeInfo?.missionName) {
                  const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
                  const missionTypeParts = translatedName.split('_');
                  if (missionTypeParts.length > 0) {
                    missionTypeDisplay = missionTypeParts[missionTypeParts.length - 1].replace('MissionName_', '');
                  }
                }
                
                // Standardize mission type for display
                if (missionTypeDisplay === 'VoidCascade') missionTypeDisplay = 'VOID CASCADE';
                if (missionTypeDisplay === 'Corruption') missionTypeDisplay = 'VOID FLOOD';
                if (missionTypeDisplay === 'Armageddon') missionTypeDisplay = 'VOID ARMAGEDDON';
                
                const tierMap: Record<string, string> = {
                  'VoidT1': 'Lith',
                  'VoidT2': 'Meso',
                  'VoidT3': 'Neo',
                  'VoidT4': 'Axi',
                  'VoidT5': 'Requiem',
                  'VoidT6': 'Omnia'
                };
                const relicTier = tierMap[mission.Modifier] || 'Unknown';
                
                const expiryDate = new Date(parseInt(mission.Expiry.$date.$numberLong));
                const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000);
                
                const embed = createEmbed({
                  type: 'info',
                  title: `${relicTier} - ${translatedNode}`,
                  description: `**Faction:** ${factionName}\n**Steel Path:** ${mission.Hard ? '✅' : '❌'}\n**Type:** ${missionTypeDisplay.toUpperCase()}\n**Expires:** <t:${expiryTimestamp}:R>`,
                  timestamp: true
                });
                
                // Only include content (role ping) with the first message
                if (i === 0) {
                  await channel.send({
                    content: content || undefined,
                    embeds: [embed]
                  });
                } else {
                  await channel.send({ embeds: [embed] });
                }
              }
              
              logger.info(`Sent initial ${matchingFissures.length} individual ${missionType}${steelPathText} fissure notifications to channel ${channel.name} (${channelId})`);
            }
          }
        }
      } catch (error) {
        logger.error('Error sending initial fissure notification:', error);
        // Don't fail the command if we can't send the initial notification
      }
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'Fissure Notifications Set',
        description: `Warframe Void Fissure updates for **${missionType}** missions will now be automatically posted in this channel.`,
        fields: [
          {
            name: 'Mission Type',
            value: missionType,
            inline: true
          },
          {
            name: 'Channel',
            value: `<#${channelId}>`,
            inline: true
          },
          {
            name: 'Role Ping',
            value: pingRole ? `<@&${pingRole.id}>` : 'No role ping configured',
            inline: true
          },
          {
            name: 'Steel Path Only',
            value: steelPath ? 'Yes' : 'No',
            inline: true
          }
        ],
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
      // Trigger immediate fissure check to process the new configuration
      try {
        triggerFissureCheck(interaction.client);
        logger.info('Manually triggered fissure check after configuration');
      } catch (error) {
        logger.error('Error triggering fissure check:', error);
        // Don't fail the command if we can't trigger the check
      }
      
    } catch (error) {
      logger.error('Error in setfissure command:', error);
      await interaction.editReply('An error occurred while setting up fissure notifications. Please try again later.');
    }
  }
};

// Force send an initial notification regardless of whether matching fissures exist
async function sendForceNotification(
  client: Client,
  guildId: string,
  channelId: string,
  missionType: string,
  steelPath: boolean,
  roleId: string | null
): Promise<void> {
  try {
    // Get the guild and channel
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`Guild ${guildId} not found, cannot send force notification`);
      return;
    }
    
    const channel = await guild.channels.fetch(channelId).catch((): null => null);
    if (!channel || !('send' in channel)) {
      logger.warn(`Channel ${channelId} in guild ${guildId} not found or not a text channel`);
      return;
    }
    
    // Create the confirmation embed
    const steelPathText = steelPath ? " Steel Path" : "";
    const embed = createEmbed({
      type: 'info',
      title: `${missionType}${steelPathText} Fissure Notifications Activated`,
      description: `You'll be notified in this channel when ${missionType}${steelPathText} fissures become available.\n\n**Status:** Waiting for matching fissures to appear...\n**Role Ping:** ${roleId ? `<@&${roleId}>` : 'No role ping configured'}`,
      footer: 'Setup notification - this appears only once',
      timestamp: true
    });
    
    // Send the message - store this message to possibly delete it later if fissures exist
    const setupMessage = await channel.send({
      embeds: [embed]
    });
    
    // If there are any matching fissures already, we should delete this setup message
    // after sending the actual fissure notifications to avoid confusion
    try {
      // Call the fissure service to manually trigger a check for this specific notification
      await import('../../services/fissureService').then(module => {
        // If the function exists, call it with a flag to delete the setup message
        if (typeof module.checkFissuresForSetup === 'function') {
          module.checkFissuresForSetup(client, guildId, channelId, missionType, steelPath, setupMessage.id);
        }
      });
    } catch (err) {
      logger.error('Error triggering fissure check:', err);
    }
    
    logger.info(`Sent force notification for ${missionType}${steelPathText} in channel ${channelId}`);
  } catch (error) {
    logger.error('Error sending force notification:', error);
  }
}

export = command; 