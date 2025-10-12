import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/discord.d';
import { logger } from '../../utils/logger';

export const data: SlashCommandBuilder = new SlashCommandBuilder()
    .setName('joinformhelp')
    .setDescription('Get help with join form commands and setup');

export const execute: Command['execute'] = async (interaction) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('📋 Join Form System Help')
            .setDescription('Here\'s how to set up and use the join form system for new members.')
            .setColor(0x5865F2)
            .addFields(
                {
                    name: '🔧 Setup Commands',
                    value: '`/setjoinform status <enabled/disabled>` - Enable/disable join form requirement\n' +
                           '`/setjoinform channel <#channel>` - Set notification channel for staff\n' +
                           '`/setjoinform role <@role>` - Set role to assign after approval',
                    inline: false
                },
                {
                    name: '👥 Admin Commands',
                    value: '`/joinform <@user>` - Send join form to specific user\n' +
                           '`/joinformreview list` - List pending submissions\n' +
                           '`/joinformreview approve <user_id> [notes]` - Approve a submission\n' +
                           '`/joinformreview deny <user_id> <reason>` - Deny a submission',
                    inline: false
                },
                {
                    name: '📝 How It Works',
                    value: '1. New members join the server\n' +
                           '2. If join form is enabled, they receive a DM with instructions\n' +
                           '3. They fill out the form with their in-game name, platform, etc.\n' +
                           '4. Staff review and approve/deny submissions\n' +
                           '5. Approved members get assigned the configured role',
                    inline: false
                },
                {
                    name: '⚙️ Form Fields',
                    value: '• **In-Game Name** (required) - Their Warframe username\n' +
                           '• **Preferred Name** (optional) - What they want to be called\n' +
                           '• **Platform** (required) - PC, PlayStation, Xbox, Nintendo Switch\n' +
                           '• **Age Confirmation** (required) - Must type "yes" to confirm 16+',
                    inline: false
                }
            )
            .setFooter({ text: 'Join form system helps maintain server quality and security' })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error in joinformhelp command:', error);
        await interaction.reply({
            content: 'An error occurred while displaying help information.',
            ephemeral: true
        });
    }
};
