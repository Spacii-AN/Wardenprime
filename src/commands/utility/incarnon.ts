import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';
import axios from 'axios';
import { logger } from '../../utils/logger';

// Rotation mappings for Steel Path Incarnon
const STEEL_PATH_ROTATIONS = [
  {
    rotation: 'A',
    weapons: ['Braton', 'Lato', 'Skana', 'Paris', 'Kunai']
  },
  {
    rotation: 'B',
    weapons: ['Boar', 'Gammacor', 'Angstrum', 'Gorgon', 'Anku']
  },
  {
    rotation: 'C',
    weapons: ['Bo', 'Latron', 'Furis', 'Furax', 'Strun']
  },
  {
    rotation: 'D',
    weapons: ['Lex', 'Magistar', 'Boltor', 'Bronco', 'Ceramic Dagger']
  },
  {
    rotation: 'E',
    weapons: ['Torid', 'Dual Toxocyst', 'Dual Ichor', 'Miter', 'Atomos']
  },
  {
    rotation: 'F',
    weapons: ['Ack & Brunt', 'Soma', 'Vasto', 'Nami Solo', 'Burston']
  },
  {
    rotation: 'G',
    weapons: ['Zylok', 'Sibear', 'Dread', 'Despair', 'Hate']
  },
  {
    rotation: 'H',
    weapons: ['Dera', 'Sybaris', 'Cestra', 'Sicarus', 'Okina']
  }
];

// Rotations reset on Monday at 00:00 UTC
function getNextMondayTimestamp(): number {
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setUTCHours(0, 0, 0, 0);
  
  // Get days until next Monday (0 is Sunday, 1 is Monday, etc)
  const daysUntilMonday = (1 + 7 - nextMonday.getUTCDay()) % 7;
  
  // If today is Monday and it's before reset, use today
  if (daysUntilMonday === 0 && now.getUTCHours() < 0) {
    return Math.floor(nextMonday.getTime() / 1000);
  }
  
  // Otherwise add days until next Monday
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  return Math.floor(nextMonday.getTime() / 1000);
}

// Helper to calculate days between now and a timestamp
function getDaysUntil(timestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((timestamp - now) / (60 * 60 * 24));
}

interface RewardCategory {
  Category: string;
  Choices: string[];
}

interface SteelPathReward {
  CurrentRotation: string;
  Weapon: string;
}

interface ApiResponse {
  EndlessXpChoices: RewardCategory[];
  SteelPathIncarnon?: SteelPathReward;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('incarnon')
    .setDescription('Displays all Incarnon rotations (normal and Steel Path).'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      logger.info('Fetching Incarnon rotations from worldstate...');
      
      // Get worldstate data
      const response = await axios.get<ApiResponse>('https://oracle.browse.wf/worldState.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'KorptairBot/1.0.0'
        }
      });
      
      // Process API data for regular incarnon rewards (frames)
      let normalRewards = 'None available';
      
      if (response?.data?.EndlessXpChoices) {
        const { EndlessXpChoices } = response.data;
        for (const category of EndlessXpChoices) {
          if (category.Category === 'EXC_NORMAL') {
            normalRewards = category.Choices.join(', ');
            break;
          }
        }
      }
      
      // Get Steel Path rotation from worldstate if available
      let currentRotationLetter = 'Unknown';
      let currentRotationWeapons: string[] = [];
      
      // If the API provides Steel Path rotation directly
      if (response?.data?.SteelPathIncarnon) {
        currentRotationLetter = response.data.SteelPathIncarnon.CurrentRotation;
        // Use the hardcoded rotation data to get all weapons for this rotation
        const rotationIndex = STEEL_PATH_ROTATIONS.findIndex(r => r.rotation === currentRotationLetter);
        if (rotationIndex !== -1) {
          currentRotationWeapons = STEEL_PATH_ROTATIONS[rotationIndex].weapons;
        } else {
          // Fallback if rotation letter doesn't match
          currentRotationWeapons = [response.data.SteelPathIncarnon.Weapon];
          logger.warn(`Unknown Steel Path rotation: ${currentRotationLetter}`);
        }
      } else {
        // If worldstate doesn't have the data, log warning
        logger.warn('SteelPathIncarnon not found in worldstate, using hardcoded data');
        
        // Fallback to date-based rotation if worldstate doesn't provide it
        // This is a temporary measure until worldstate includes this data
        const dateNow = new Date();
        const hardcodedStartDate = new Date('2024-03-03T00:00:00Z');
        const daysSinceStart = Math.floor((dateNow.getTime() - hardcodedStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const weeksSinceStart = Math.floor(daysSinceStart / 7);
        const rotationIndex = weeksSinceStart % STEEL_PATH_ROTATIONS.length;
        
        currentRotationLetter = STEEL_PATH_ROTATIONS[rotationIndex].rotation;
        currentRotationWeapons = STEEL_PATH_ROTATIONS[rotationIndex].weapons;
      }
      
      // Format the active weapons as a comma-separated list
      const activeWeapons = currentRotationWeapons.join(', ');
      
      // Calculate upcoming rotations
      const nextMondayTimestamp = getNextMondayTimestamp();
      const daysUntilNextRotation = getDaysUntil(nextMondayTimestamp);
      
      // Get index of current rotation
      const currentIndex = STEEL_PATH_ROTATIONS.findIndex(r => r.rotation === currentRotationLetter);
      if (currentIndex === -1) {
        logger.error(`Could not find rotation ${currentRotationLetter} in rotation data`);
      }
      
      // Calculate upcoming rotations
      const upcomingRotations = [];
      let nextTimestamp = nextMondayTimestamp;
      
      for (let i = 1; i < STEEL_PATH_ROTATIONS.length; i++) {
        const nextIndex = (currentIndex + i) % STEEL_PATH_ROTATIONS.length;
        const nextRotation = STEEL_PATH_ROTATIONS[nextIndex];
        
        upcomingRotations.push({
          rotation: nextRotation,
          timestamp: nextTimestamp
        });
        
        // Next rotation is 7 days later
        nextTimestamp += 7 * 24 * 60 * 60; // Add a week in seconds
      }
      
      // Build the upcoming weapons description with Discord timestamps
      let upcomingDescription = '';
      
      upcomingRotations.forEach((item) => {
        upcomingDescription += `<t:${item.timestamp}:R> ${item.rotation.weapons.join(', ')}\n`;
      });

      // Create the embed
      const embed = createEmbed({
        type: 'info',
        title: `Circuit - Incarnons - Week ${currentRotationLetter}`,
        fields: [
          { 
            name: 'Normal Incarnon Rewards',
            value: normalRewards,
            inline: false 
          },
          { 
            name: 'Active',
            value: activeWeapons,
            inline: false 
          },
          {
            name: 'Rotates:',
            value: `<t:${nextMondayTimestamp}:F> (<t:${nextMondayTimestamp}:R>)`,
            inline: false
          },
          { 
            name: 'Upcoming',
            value: upcomingDescription,
            inline: false 
          }
        ],
        timestamp: false
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      // Log the full error message for debugging
      logger.error('Error generating Incarnon rotations:', error);

      const errorEmbed = createEmbed({
        type: 'error',
        title: 'Error',
        description: 'Failed to generate Incarnon rotations. Please try again later.',
        timestamp: true
      });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export = command;
