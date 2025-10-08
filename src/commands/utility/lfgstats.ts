import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lfgstats')
    .setDescription('View LFG statistics and leaderboard')
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View the server LFG leaderboard')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('me')
        .setDescription('View your own LFG stats')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('View LFG stats for a specific user')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('The user to view stats for')
            .setRequired(true)
        )
    ) as SlashCommandBuilder,
  
  cooldown: 5,
  
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    
    try {
      if (!pgdb) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Database Error',
            description: 'Database connection is not available.',
            timestamp: true
          })]
        });
        return;
      }
      
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'leaderboard') {
        await handleLeaderboard(interaction);
      } else if (subcommand === 'me') {
        await handleUserStats(interaction, interaction.user.id);
      } else if (subcommand === 'user') {
        const targetUser = interaction.options.getUser('target');
        if (!targetUser) {
          await interaction.editReply({
            embeds: [createEmbed({
              type: 'error',
              title: 'Invalid User',
              description: 'Could not find the specified user.',
              timestamp: true
            })]
          });
          return;
        }
        await handleUserStats(interaction, targetUser.id);
      }
    } catch (error) {
      logger.error(`Error executing lfgstats command: ${error}`);
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  }
};

/**
 * Handle the leaderboard subcommand
 */
async function handleLeaderboard(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  
  // Get the leaderboard data
  const leaderboard = await pgdb!.getLfgLeaderboard(guildId, 10);
  
  if (leaderboard.length === 0) {
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'info',
        title: 'LFG Leaderboard',
        description: 'No LFG sessions have been completed yet in this server.',
        timestamp: true
      })]
    });
    return;
  }
  
  // Fetch user data for the leaderboard
  const leaderboardWithUsers = await Promise.all(
    leaderboard.map(async (entry, index) => {
      try {
        const user = await interaction.client.users.fetch(entry.user_id);
        return {
          position: index + 1,
          user: user,
          completed: entry.completed_count
        };
      } catch (error) {
        // If user can't be fetched, use a placeholder
        return {
          position: index + 1,
          user: { tag: 'Unknown User', id: entry.user_id },
          completed: entry.completed_count
        };
      }
    })
  );
  
  // Create the leaderboard embed
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🏆 LFG Leaderboard')
    .setDescription(`Top players who've completed LFG missions in ${interaction.guild!.name}`)
    .setTimestamp();
  
  // Add leaderboard entries
  const leaderboardText = leaderboardWithUsers
    .map(entry => {
      const medal = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `${entry.position}.`;
      return `${medal} <@${entry.user.id}> - **${entry.completed}** mission${entry.completed !== 1 ? 's' : ''} completed`;
    })
    .join('\n');
  
  embed.setDescription(`**Top LFG Participants in ${interaction.guild!.name}**\n\n${leaderboardText}\n\n*Use \`/lfgstats me\` to view your personal stats*`);
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle the user stats subcommand
 */
async function handleUserStats(interaction: ChatInputCommandInteraction, userId: string) {
  // Fetch user data
  let user;
  try {
    user = await interaction.client.users.fetch(userId);
  } catch (error) {
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'User Not Found',
        description: 'Could not find the specified user.',
        timestamp: true
      })]
    });
    return;
  }
  
  // Get user's completed LFG count
  const completedCount = await pgdb!.getCompletedLfgCount(userId, interaction.guildId!);
  
  // Get user's position on the leaderboard
  const leaderboard = await pgdb!.getLfgLeaderboard(interaction.guildId!, 100);
  const userRank = leaderboard.findIndex(entry => entry.user_id === userId) + 1;
  
  // Create the stats embed
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`LFG Stats: ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '🎮 Missions Completed', value: `**${completedCount}**`, inline: true },
      { name: '🏆 Server Rank', value: userRank > 0 ? `**#${userRank}**` : '*Not Ranked*', inline: true }
    )
    .setFooter({ text: 'Complete more LFG missions to rise in the rankings!' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// Export the command properly
export const { data, execute } = command;
export default command; 