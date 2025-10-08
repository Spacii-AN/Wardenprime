import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import axios from 'axios';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs';

// Define the structure for relic and region information
interface RelicInfo {
  relicName: string;
  tier: string;
  relicRewards: string[];
}

interface RegionInfo {
  name: string;
  systemName: string;
  missionName: string;
  factionName: string;
}

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

interface ApiResponse {
  ActiveMissions: ActiveMission[];
}

// Mapping for Void Fissure Tiers to Relic Names
const VOID_TIER_MAP: Record<string, string> = {
  'VoidT1': 'Lith',
  'VoidT2': 'Meso',
  'VoidT3': 'Neo',
  'VoidT4': 'Axi',
  'VoidT5': 'Requiem',
  'VoidT6': 'Omnia'
};

// Load dictionaries and data from the required files
async function loadData() {
  const regionsPath = path.join(process.cwd(), 'dict', 'ExportRegions.json');
  const regionsData = JSON.parse(await fs.promises.readFile(regionsPath, 'utf8')) as Record<string, RegionInfo>;

  const relicsPath = path.join(process.cwd(), 'dict', 'ExportRelics.json');
  const relicsData = JSON.parse(await fs.promises.readFile(relicsPath, 'utf8')) as Record<string, RelicInfo>;

  const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
  const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;

  return { regionsData, relicsData, langDict };
}

// Helper function to get relic tier name from modifier
function getRelicTierFromModifier(modifier: string): string {
  return VOID_TIER_MAP[modifier] || 'Unknown';
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('fissure')
    .setDescription('Displays active void fissure missions.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      logger.info('Fetching current fissure missions...');
      const response = await axios.get<ApiResponse>('https://oracle.browse.wf/worldState.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'KorptairBot/1.0.0'
        }
      });

      const { ActiveMissions } = response.data;

      if (!ActiveMissions || ActiveMissions.length === 0) {
        throw new Error('No active missions found or incorrect format.');
      }

      // Filter only void fissure missions
      const fissureMissions = ActiveMissions.filter(mission => mission.Modifier && mission.Modifier.startsWith('VoidT'));

      if (fissureMissions.length === 0) {
        throw new Error('No void fissure missions found.');
      }

      let normalFissures: string[] = [];
      let steelPathFissures: string[] = [];

      // Load necessary data (regions, relics, and language dictionary)
      const { regionsData, langDict } = await loadData();

      // Group missions by relic tier
      const missionsByTier: Record<string, { normal: ActiveMission[], steelPath: ActiveMission[] }> = {};

      // Initialize mission categories for each tier
      Object.keys(VOID_TIER_MAP).forEach(tier => {
        missionsByTier[tier] = { normal: [], steelPath: [] };
      });

      // Sort missions into tiers and difficulty
      fissureMissions.forEach(mission => {
        const tierKey = mission.Modifier;
        if (!missionsByTier[tierKey]) {
          missionsByTier[tierKey] = { normal: [], steelPath: [] };
        }

        if (mission.Hard) {
          missionsByTier[tierKey].steelPath.push(mission);
        } else {
          missionsByTier[tierKey].normal.push(mission);
        }
      });

      // Format missions for display
      Object.entries(missionsByTier).forEach(([tierKey, missions]) => {
        const relicTier = getRelicTierFromModifier(tierKey);
        
        missions.normal.forEach(mission => {
          const nodeInfo = regionsData[mission.Node];
          const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : mission.Node;
          const translatedMission = nodeInfo?.missionName ? (langDict[nodeInfo.missionName] || nodeInfo.missionName) : mission.MissionType;
          
          const expiryDate = new Date(parseInt(mission.Expiry.$date.$numberLong));
          const timeLeft = Math.floor((expiryDate.getTime() - Date.now()) / 1000);
          
          normalFissures.push(`**${relicTier}** - ${translatedMission} - ${translatedNode} (<t:${Math.floor(expiryDate.getTime() / 1000)}:R>)`);
        });
        
        missions.steelPath.forEach(mission => {
          const nodeInfo = regionsData[mission.Node];
          const translatedNode = nodeInfo?.name ? (langDict[nodeInfo.name] || nodeInfo.name) : mission.Node;
          const translatedMission = nodeInfo?.missionName ? (langDict[nodeInfo.missionName] || nodeInfo.missionName) : mission.MissionType;
          
          const expiryDate = new Date(parseInt(mission.Expiry.$date.$numberLong));
          const timeLeft = Math.floor((expiryDate.getTime() - Date.now()) / 1000);
          
          steelPathFissures.push(`**${relicTier}** - ${translatedMission} - ${translatedNode} (<t:${Math.floor(expiryDate.getTime() / 1000)}:R>)`);
        });
      });

      // Sort fissures by tier
      const sortOrder = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
      
      normalFissures.sort((a, b) => {
        const tierA = sortOrder.findIndex(tier => a.includes(tier));
        const tierB = sortOrder.findIndex(tier => b.includes(tier));
        return tierA - tierB;
      });
      
      steelPathFissures.sort((a, b) => {
        const tierA = sortOrder.findIndex(tier => a.includes(tier));
        const tierB = sortOrder.findIndex(tier => b.includes(tier));
        return tierA - tierB;
      });

      // Prepare the embed to display the missions
      const embed = createEmbed({
        type: 'info',
        title: 'Active Void Fissures',
        fields: [
          { 
            name: 'Normal Fissures', 
            value: normalFissures.length > 0 ? normalFissures.join('\n') : 'None available', 
            inline: false 
          },
          { 
            name: 'Steel Path Fissures', 
            value: steelPathFissures.length > 0 ? steelPathFissures.join('\n') : 'None available', 
            inline: false 
          }
        ],
        timestamp: false,
        thumbnail: steelPathFissures.length > 0 ? 
          'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Currency/SteelEssence.png' : 
          (normalFissures.length > 0 ? 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Currency/Luminous.png' : undefined)
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      // Log the error for debugging and provide feedback to the user
      logger.error('Error fetching fissure missions:', error);

      const errorEmbed = createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to retrieve void fissure missions. Please try again later.',
        timestamp: true
      });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export = command;
