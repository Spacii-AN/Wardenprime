import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction
} from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';

// Tier emoji mappings
const TIER_EMOJIS: Record<string, string> = {
  'S': '<:S_:1362400790160871574>',
  'A': '<:A_:1362400688599994461>',
  'B': '<:B_:1362400717444481094>',
  'C': '<:C_:1362400738852208722>',
  'D': '<:D_:1362400752869572829>',
  'F': '<:F_:1362400771521646725>'
};

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('arby')
    .setDescription('Shows current and upcoming Arbitration missions'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      // Load arby tiers
      const arbyTiersPath = path.join(process.cwd(), 'src', 'data', 'arby_tiers.json');
      const arbyTiers = JSON.parse(await fs.promises.readFile(arbyTiersPath, 'utf8')) as Record<string, string>;
      logger.info(`Loaded arby tiers for ${Object.keys(arbyTiers).length} nodes`);
      
      // Load regions data for node information
      const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
      const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, NodeInfo>;
      logger.info(`Loaded regions data with ${Object.keys(regionsData).length} entries`);
      
      // Load language dictionary for translations
      const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
      logger.info(`Loaded language dictionary with ${Object.keys(langDict).length} entries`);
      
      // Fetch arbitration data
      logger.info('Fetching arbitration data from browse.wf');
      const response = await axios.get('https://browse.wf/arbys.txt', {
        timeout: 10000,
        headers: {
          'User-Agent': 'KorptairBot/1.0.0'
        }
      });
      
      const arbitrationsText = response.data as string;
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Parse the arbitrations data
      const arbitrations = arbitrationsText.split('\n')
        .filter((line: string) => line.trim() !== '')
        .map((line: string) => {
          const [timestamp, node] = line.split(',');
          return {
            timestamp: parseInt(timestamp),
            node: node.trim()
          } as ArbitrationEntry;
        })
        .filter((arby: ArbitrationEntry) => arby.timestamp && arby.node);
      
      logger.info(`Found ${arbitrations.length} arbitration entries`);
      
      // Find current and upcoming arbitrations
      const currentIndex = arbitrations.findIndex((arby: ArbitrationEntry) => arby.timestamp <= currentTime && currentTime < arby.timestamp + 3600);
      
      if (currentIndex === -1) {
        await interaction.editReply('Could not determine the current arbitration. Please try again later.');
        return;
      }
      
      // Get arbitrations for next 24 hours for the regular display
      const nextDayArbitrations = arbitrations.slice(
        currentIndex, 
        arbitrations.findIndex((arby: ArbitrationEntry) => arby.timestamp > currentTime + 86400) || arbitrations.length 
      );
      
      // Get arbitrations for next two weeks for noteworthy section
      const twoWeeksArbitrations = arbitrations.slice(
        currentIndex,
        arbitrations.findIndex((arby: ArbitrationEntry) => arby.timestamp > currentTime + (14 * 86400)) || arbitrations.length
      );
      
      if (nextDayArbitrations.length === 0) {
        nextDayArbitrations.push(arbitrations[currentIndex]);
      }
      
      // Process arbitration data for display
      const arbitrationDetails = await Promise.all(nextDayArbitrations.map(async (arby: ArbitrationEntry, index: number) => {
        // Get node info from regions data
        const nodeInfo = regionsData[arby.node];
        if (!nodeInfo) {
          logger.warn(`Node info not found for ${arby.node}`);
          return {
            timestamp: arby.timestamp,
            endTimestamp: index === 0 ? arby.timestamp + 3600 : arby.timestamp,
            node: arby.node,
            nodeName: 'Unknown',
            systemName: 'Unknown',
            missionType: 'Unknown',
            faction: 'Unknown',
            tier: arbyTiers[arby.node] || 'F',
            isActive: index === 0
          } as ArbitrationDetail;
        }
        
        // Translate node name, mission type, and faction
        const nodeName = langDict[nodeInfo.name] || nodeInfo.name;
        const systemName = langDict[nodeInfo.systemName] || nodeInfo.systemName;
        const missionType = langDict[nodeInfo.missionName] || nodeInfo.missionName;
        const faction = langDict[nodeInfo.factionName] || nodeInfo.factionName;
        
        return {
          timestamp: arby.timestamp,
          endTimestamp: index === 0 ? arby.timestamp + 3600 : arby.timestamp,
          node: arby.node,
          nodeName,
          systemName,
          missionType,
          faction,
          tier: arbyTiers[arby.node] || 'F',
          isActive: index === 0
        } as ArbitrationDetail;
      }));
      
      // Process the two-week arbitrations separately for noteworthy section
      const twoWeekDetails = await Promise.all(twoWeeksArbitrations.map(async (arby: ArbitrationEntry) => {
        const nodeInfo = regionsData[arby.node];
        if (!nodeInfo) {
          return {
            timestamp: arby.timestamp,
            node: arby.node,
            nodeName: 'Unknown',
            systemName: 'Unknown',
            tier: arbyTiers[arby.node] || 'F'
          };
        }
        
        const nodeName = langDict[nodeInfo.name] || nodeInfo.name;
        const systemName = langDict[nodeInfo.systemName] || nodeInfo.systemName;
        
        return {
          timestamp: arby.timestamp,
          node: arby.node,
          nodeName,
          systemName,
          tier: arbyTiers[arby.node] || 'F'
        };
      }));
      
      // Create embed
      const current = arbitrationDetails[0];
      
      // Get the next 3 arbitrations for upcoming section
      const upcomingArbitrations = arbitrationDetails.slice(1, 4);
      
      // Find all S and A tier arbitrations in the next two weeks
      // Skip the current and immediate upcoming ones that are already displayed
      const upcomingIds = new Set([current.node, ...upcomingArbitrations.map(a => a.node)]);
      
      const noteworthyArbitrations = twoWeekDetails
        .filter(arby => (arby.tier === 'S' || arby.tier === 'A') && !upcomingIds.has(arby.node))
        .slice(0, 5); // Limit to 5 to avoid too long embed
      
      const arbyEmbed = createEmbed({
        type: 'info',
        title: `${current.tier} Tier | ${current.nodeName} (${current.systemName})`,
        description: `Arbi Ends <t:${current.endTimestamp}:R>`,
        fields: [
          {
            name: 'Enemy',
            value: current.faction,
            inline: true
          },
          {
            name: 'Mission type',
            value: current.missionType,
            inline: true
          },
          {
            name: 'Upcoming Arbitrations',
            value: upcomingArbitrations.length > 0 
              ? upcomingArbitrations.map(arby => 
                `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
              ).join('\n')
              : 'No upcoming arbitrations found',
            inline: false
          },
          ...(noteworthyArbitrations.length > 0 ? [{
            name: 'Noteworthy Arbitrations',
            value: noteworthyArbitrations.map(arby => 
              `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
            ).join('\n'),
            inline: false
          }] : [])
        ],
        thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Resources/CraftingComponents/Elitium.png',
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [arbyEmbed] });
      
    } catch (error) {
      logger.error('Error in arby command:', error);
      await interaction.editReply('An error occurred while fetching arbitration data. Please try again later.');
    }
  }
};

// Helper interfaces
interface ArbitrationEntry {
  timestamp: number;
  node: string;
}

interface NodeInfo {
  name: string;
  systemName: string;
  missionName: string;
  factionName: string;
  [key: string]: any;
}

interface ArbitrationDetail {
  timestamp: number;
  endTimestamp: number;
  node: string;
  nodeName: string;
  systemName: string;
  missionType: string;
  faction: string;
  tier: string;
  isActive: boolean;
}

// Export the command in the format expected by the command loader
export = command; 