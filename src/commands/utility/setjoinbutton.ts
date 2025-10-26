import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../../types/discord.d';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';

export const data = new SlashCommandBuilder()
    .setName('setjoinbutton')
    .setDescription('Create or update the join form button message')
    .addStringOption(option =>
        option
            .setName('title')
            .setDescription('Title for the join form message')
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName('description')
            .setDescription('Description for the join form message')
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName('button_text')
            .setDescription('Text for the join form button')
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName('button_emoji')
            .setDescription('Emoji for the join form button')
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute: Command['execute'] = async (interaction) => {
    try {
        const title = interaction.options.getString('title') || 'Join Our Warframe Community!';
        const description = interaction.options.getString('description') || 
            'Welcome to our Warframe community! To gain access to all server features, please complete our join form.';
        const buttonText = interaction.options.getString('button_text') || 'Complete Join Form';
        const buttonEmoji = interaction.options.getString('button_emoji') || '📋';

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x5865F2)
            .addFields(
                { name: '🔐 Server Access', value: 'Complete the form to unlock all server features', inline: false },
                { name: '📋 What to Expect', value: 'Quick questions about your in-game name, platform, and age verification', inline: false },
                { name: '⏱️ Processing', value: 'Your application will be reviewed within 24 hours', inline: false }
            )
            .setFooter({ text: 'Click the button below to get started!' })
            .setTimestamp();

        // Create the button
        const button = new ButtonBuilder()
            .setCustomId('join_form_button')
            .setLabel(buttonText)
            .setEmoji(buttonEmoji)
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        // Send the message
        const message = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        // Update the join form configuration
        await pgdb.updateJoinFormConfig(interaction.guild.id, {
            buttonChannelId: interaction.channel.id,
            buttonMessageId: message.id,
            buttonText: buttonText,
            buttonEmoji: buttonEmoji
        });

        logger.info(`Join form button created in channel ${interaction.channel.id} for guild ${interaction.guild.id}`);

    } catch (error) {
        logger.error('Error creating join form button:', error);
        await interaction.reply({
            content: 'An error occurred while creating the join form button.',
            ephemeral: true
        });
    }
};
