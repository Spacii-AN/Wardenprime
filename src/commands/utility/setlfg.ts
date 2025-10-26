import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  Role,
  Client,
  AutocompleteInteraction
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { triggerFissureCheck } from '../../services/fissureService';
import { ActiveMission } from '../../types/warframe';

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
  'Alchemy',
  'Void Cascade',
  'Void Flood',
  'Void Armageddon'
] as const;

type MissionType = typeof MISSION_TYPES[number];

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setlfg')
    .setDescription('Set up notifications for specific fissure missions with node selection')
    .addBooleanOption(option => 
      option.setName('steel_path')
        .setDescription('Steel Path (SP) or Normal mission')
        .setRequired(true)
    )
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
        )
    )
    .addStringOption(option =>
      option.setName('node')
        .setDescription('Specific node to monitor (autocomplete based on mission type)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('Role to ping when matching fissures are found')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      const steelPath = interaction.options.getBoolean('steel_path', true);
      const missionType = interaction.options.getString('mission_type', true) as MissionType;
      const nodeName = interaction.options.getString('node', true);
      const pingRole = interaction.options.getRole('ping_role');
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      
      // Standardize mission type for consistent comparison
      const standardizedType = missionType.charAt(0).toUpperCase() + missionType.slice(1);
      
      logger.debug(`Setting up LFG notification for ${missionType} on ${nodeName}, Steel Path: ${steelPath}`);
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Check if a configuration already exists for this guild, mission type, node, and Steel Path setting
      const existingConfigs = await pgdb.getFissureNotifications();
      const existingMissionConfig = existingConfigs.filter(
        config => config.guild_id === guildId && 
                 config.mission_type === standardizedType && 
                 config.channel_id === channelId && 
                 config.steel_path === steelPath &&
                 config.node_name === nodeName
      );
      
      if (existingMissionConfig.length > 0) {
        // Update existing configuration in PostgreSQL
        await pgdb.query(
          `UPDATE fissure_notifications 
           SET role_id = $1, updated_at = NOW() 
           WHERE id = $2`,
          [pingRole?.id || null, existingMissionConfig[0].id]
        );
        
        logger.info(`Updated LFG notification for guild ${guildId}, mission type ${missionType}, node ${nodeName}, Steel Path: ${steelPath}`);
      } else {
        // Create new configuration in PostgreSQL
        await pgdb.addFissureNotification(
          guildId,
          channelId,
          standardizedType,
          steelPath,
          pingRole?.id || null,
          nodeName
        );
        
        logger.info(`Set LFG notification for guild ${guildId}, mission type ${missionType}, node ${nodeName}, Steel Path: ${steelPath}`);
      }
      
      // Check if there are active fissures matching this criteria
      try {
        // Fetch current fissure data
        const response = await axios.get('https://oracle.browse.wf/worldState.json', {
          timeout: 10000,
          headers: {
            'User-Agent': 'WardenPrimeBot/1.0.0'
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
          
          // Find matching mission
          const matchingMission = fissureMissions.find((mission: any) => {
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
            
            // Check mission type match
            const missionTypeMatch = currentMissionType.toLowerCase() === missionType.toLowerCase();
            
            // Check node match
            const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : mission.Node;
            const nodeMatch = translatedNode.toLowerCase() === nodeName.toLowerCase();
            
            // Check Steel Path match
            const steelPathMatch = steelPath ? mission.Hard : !mission.Hard;
            
            return missionTypeMatch && nodeMatch && steelPathMatch;
          });
          
          if (matchingMission) {
            // Create detailed embed for the matching mission
            const nodeInfo = regionsData[matchingMission.Node];
            const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : matchingMission.Node;
            const translatedSystem = nodeInfo?.systemName ? (langDict[nodeInfo.systemName] || nodeInfo.systemName) : 'Unknown';
            const factionName = nodeInfo?.factionName ? (langDict[nodeInfo.factionName] || nodeInfo.factionName) : 'Unknown';
            
            // Get mission type
            let missionTypeDisplay = matchingMission.MissionType;
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
            const relicTier = tierMap[matchingMission.Modifier] || 'Unknown';
            
            const expiryDate = new Date(parseInt(matchingMission.Expiry.$date.$numberLong));
            const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000);
            
            // Get enemy level based on node data
            const enemyLevel = getEnemyLevelForNode(nodeInfo, steelPath);
            
            const embed = createEmbed({
              type: 'info',
              title: `${relicTier} - ${translatedNode}`,
              description: `**Mission Type:** ${missionTypeDisplay.toUpperCase()}\n**Faction:** ${factionName}\n**Enemy Level:** ${enemyLevel}\n**Steel Path:** ${matchingMission.Hard ? '✅' : '❌'}\n**Relic Tier:** ${relicTier}\n**Expires:** <t:${expiryTimestamp}:R>`,
              timestamp: true
            });
            
            // Send the detailed embed
            const channel = await interaction.guild?.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              const steelPathText = steelPath ? " Steel Path" : "";
              const content = pingRole ? `<@&${pingRole.id}> ${missionType}${steelPathText} fissure on ${translatedNode} is available!` : null;
              
              await channel.send({
                content: content || undefined,
                embeds: [embed]
              });
              
              logger.info(`Sent detailed LFG notification for ${missionType}${steelPathText} on ${translatedNode} in channel ${channel.name} (${channelId})`);
            }
          }
        }
      } catch (error) {
        logger.error('Error sending initial LFG notification:', error);
        // Don't fail the command if we can't send the initial notification
      }
      
      // Create success embed
      const successEmbed = createEmbed({
        type: 'success',
        title: 'LFG Notifications Set',
        description: `Warframe Void Fissure updates for **${missionType}** missions on **${nodeName}** will now be automatically posted in this channel.`,
        fields: [
          {
            name: 'Mission Type',
            value: missionType,
            inline: true
          },
          {
            name: 'Node',
            value: nodeName,
            inline: true
          },
          {
            name: 'Steel Path',
            value: steelPath ? 'Yes' : 'No',
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
          }
        ],
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [successEmbed] });
      
      // Trigger immediate fissure check to process the new configuration
      try {
        triggerFissureCheck(interaction.client);
        logger.info('Manually triggered fissure check after LFG configuration');
      } catch (error) {
        logger.error('Error triggering fissure check:', error);
        // Don't fail the command if we can't trigger the check
      }
      
    } catch (error) {
      logger.error('Error in setlfg command:', error);
      await interaction.editReply('An error occurred while setting up LFG notifications. Please try again later.');
    }
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focusedValue = interaction.options.getFocused();
      const missionType = interaction.options.getString('mission_type');
      
      if (!missionType) {
        await interaction.respond([]);
        return;
      }
      
      // Load regions data to get nodes for the specific mission type
      const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
      const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, any>;
      
      const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
      
      // Find all nodes that match the mission type
      const matchingNodes: Array<{ name: string; value: string }> = [];
      
      for (const [nodeId, nodeInfo] of Object.entries(regionsData)) {
        if (nodeInfo.missionName) {
          const translatedName = langDict[nodeInfo.missionName] || nodeInfo.missionName;
          const missionTypeParts = translatedName.split('_');
          if (missionTypeParts.length > 0) {
            let currentMissionType = missionTypeParts[missionTypeParts.length - 1].replace('MissionName_', '');
            
            // Handle special Zariman mission types
            if (currentMissionType === 'VoidCascade') currentMissionType = 'Void Cascade';
            if (currentMissionType === 'Corruption') currentMissionType = 'Void Flood';
            if (currentMissionType === 'Armageddon') currentMissionType = 'Void Armageddon';
            
            if (currentMissionType.toLowerCase() === missionType.toLowerCase()) {
              const nodeName = nodeInfo.name ? (langDict[nodeInfo.name] || nodeInfo.name) : nodeId;
              matchingNodes.push({
                name: nodeName,
                value: nodeName
              });
            }
          }
        }
      }
      
      // Filter based on focused value
      const filteredNodes = matchingNodes
        .filter(node => node.name.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25); // Discord limit
      
      await interaction.respond(filteredNodes);
      
    } catch (error) {
      logger.error('Error in setlfg autocomplete:', error);
      await interaction.respond([]);
    }
  }
};

// Helper function to get enemy level based on node data
function getEnemyLevelForNode(nodeInfo: any, steelPath: boolean): string {
  if (!nodeInfo) {
    return 'Unknown';
  }
  
  // Get base enemy levels from the node data
  const minLevel = nodeInfo.minEnemyLevel || 1;
  const maxLevel = nodeInfo.maxEnemyLevel || minLevel + 5;
  
  // Steel Path adds +100 to enemy levels
  // Fissures typically add +5 to enemy levels
  const steelPathBoost = steelPath ? 100 : 0;
  const fissureBoost = 5; // Fissures add +5 levels
  
  const adjustedMinLevel = minLevel + steelPathBoost + fissureBoost;
  const adjustedMaxLevel = maxLevel + steelPathBoost + fissureBoost;
  
  return `${adjustedMinLevel}-${adjustedMaxLevel}`;
}

export = command;
