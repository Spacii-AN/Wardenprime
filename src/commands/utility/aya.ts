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

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('aya')
    .setDescription('Shows which Cetus tents have Aya-rewarding bounties'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    try {
      // Load dictionary for translations
      const dictPath = path.join(process.cwd(), 'dict', 'dict.en.json');
      const langDict = JSON.parse(await fs.promises.readFile(dictPath, 'utf8')) as Record<string, string>;
      logger.info(`Loaded language dictionary with ${Object.keys(langDict).length} entries`);
      
      // Load bounty data for bounty names
      const bountiesPath = path.join(process.cwd(), 'dict', 'ExportBounties.json');
      const bountiesDict = JSON.parse(await fs.promises.readFile(bountiesPath, 'utf8')) as Record<string, BountyInfo>;
      logger.info(`Loaded bounties data with ${Object.keys(bountiesDict).length} entries`);
      
      // Bounties we're looking for (these are the ones that can reward Aya)
      const ayaBounties = [
        "/Lotus/Types/Gameplay/Eidolon/Jobs/ReclamationBountyCap",
        "/Lotus/Types/Gameplay/Eidolon/Jobs/ReclamationBountyCache"
      ];
      
      // Fetch location bounties to see what's available in each tent
      logger.info('Fetching location bounties from browse.wf');
      const locationBountiesResponse = await axios.get('https://oracle.browse.wf/location-bounties', {
        timeout: 10000,
        headers: {
          'User-Agent': 'KorptairBot/1.0.0'
        }
      });
      
      const locationData = locationBountiesResponse.data;
      
      // Check if we have Cetus data
      if (!locationData.CetusSyndicate) {
        await interaction.editReply('Unable to retrieve Cetus bounty data. Please try again later.');
        return;
      }
      
      // Fetch world state to get expiry time
      logger.info('Fetching world state data from browse.wf');
      const worldStateResponse = await axios.get('https://oracle.browse.wf/worldState.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'KorptairBot/1.0.0'
        }
      });
      
      // Find the Cetus syndicate mission to get rotation expiry
      const worldStateData = worldStateResponse.data;
      let expiryTimestamp = locationData.expiry || 0;
      
      if (worldStateData?.SyndicateMissions) {
        const cetusMission = worldStateData.SyndicateMissions.find((mission: any) => 
          mission.Tag === "CetusSyndicate"
        );
        
        if (cetusMission?.Expiry?.$date?.$numberLong) {
          expiryTimestamp = parseInt(cetusMission.Expiry.$date.$numberLong) / 1000;
        }
      }
      
      // Check which tents have Aya bounties
      const tents = ['TentA', 'TentB', 'TentC'];
      const tentResults: Record<string, Array<string>> = {};
      
      for (const tent of tents) {
        const tentBounties = locationData.CetusSyndicate[tent] || [];
        const ayaInTent = tentBounties.filter((bounty: string) => ayaBounties.includes(bounty));
        
        if (ayaInTent.length > 0) {
          tentResults[tent] = ayaInTent.map((bountyPath: string) => {
            const bountyInfo = bountiesDict[bountyPath];
            if (bountyInfo) {
              const translatedName = langDict[bountyInfo.name] || bountyInfo.name;
              return translatedName;
            }
            return bountyPath.split('/').pop() || bountyPath;
          });
        }
      }
      
      // Create embed
      const ayaEmbed = createEmbed({
        type: 'info',
        title: 'Warframe Bounties',
        description: `Current Bounties\nReset <t:${Math.floor(expiryTimestamp)}:R>`,
        fields: [
          {
            name: 'Konzu Bounties:',
            value: '🔴 No good bounties available.',
            inline: false
          },
          {
            name: 'Tent A Bounties:',
            value: tentResults.TentA && tentResults.TentA.length > 0 ? 
              `🟢 Found Aya bounties:\n• ${tentResults.TentA.join('\n• ')}` : 
              '🔴 No good bounties available.',
            inline: false
          },
          {
            name: 'Tent B Bounties:',
            value: tentResults.TentB && tentResults.TentB.length > 0 ? 
              `🟢 Found Aya bounties:\n• ${tentResults.TentB.join('\n• ')}` : 
              '🔴 No good bounties available.',
            inline: false
          },
          {
            name: 'Tent C Bounties:',
            value: tentResults.TentC && tentResults.TentC.length > 0 ? 
              `🟢 Found Aya bounties:\n• ${tentResults.TentC.join('\n• ')}` : 
              '🔴 No good bounties available.',
            inline: false
          }
        ],
        thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Currency/Aya.png',
        timestamp: true
      });
      
      await interaction.editReply({ embeds: [ayaEmbed] });
      
    } catch (error) {
      logger.error('Error in aya command:', error);
      await interaction.editReply('An error occurred while fetching Aya bounty information. Please try again later.');
    }
  }
};

// Helper interfaces
interface BountyInfo {
  name: string;
  description: string;
  icon: string;
  stages: Array<Array<string>>;
}

// Export the command in the format expected by the command loader
export = command; 