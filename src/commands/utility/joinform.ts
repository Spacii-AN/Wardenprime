import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/discord.d';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
    .setName('joinform')
    .setDescription('Send a join form to a user')
    .addUserOption(option =>
        option
            .setName('user')
            .setDescription('The user to send the join form to')
            .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute: Command['execute'] = async (interaction) => {
    try {
        const user = interaction.options.getUser('user', true);
        
        // Create the join form modal
        const modal = new ModalBuilder()
            .setCustomId('join_form_modal')
            .setTitle('Join Form');

        // In-Game Name field (required)
        const ignInput = new TextInputBuilder()
            .setCustomId('ign_input')
            .setLabel('In-Game Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Your in-game name such as "User#000"')
            .setRequired(true)
            .setMaxLength(50);

        // Preferred Name field (optional)
        const preferredNameInput = new TextInputBuilder()
            .setCustomId('preferred_name_input')
            .setLabel('Preferred Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('What you prefer to be called by')
            .setRequired(false)
            .setMaxLength(30);

        // Platform field (required)
        const platformInput = new TextInputBuilder()
            .setCustomId('platform_input')
            .setLabel('Platform')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('PC, PlayStation, Xbox, Nintendo Switch')
            .setRequired(true)
            .setMaxLength(20);

        // Age confirmation field (required)
        const ageConfirmInput = new TextInputBuilder()
            .setCustomId('age_confirm_input')
            .setLabel('Age Confirmation')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type "yes" to confirm you are over 16')
            .setRequired(true)
            .setMaxLength(10);

        // Add inputs to modal
        const ignRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ignInput);
        const preferredNameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(preferredNameInput);
        const platformRow = new ActionRowBuilder<TextInputBuilder>().addComponents(platformInput);
        const ageConfirmRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ageConfirmInput);

        modal.addComponents(ignRow, preferredNameRow, platformRow, ageConfirmRow);

        // Send modal to user via DM
        try {
            const dmChannel = await user.createDM();
            await dmChannel.send({
                content: `Hello ${user.username}! Welcome to our Warframe community! Please fill out this form to gain access to the server.`,
                embeds: [new EmbedBuilder()
                    .setTitle('🔐 Server Access Required')
                    .setDescription('To join our community, please complete the join form below.')
                    .setColor(0x5865F2)
                    .setFooter({ text: 'This form is required for server access' })
                ]
            });

            // Send the modal (this will be handled by the modal submit event)
            await interaction.reply({
                content: `Join form has been sent to ${user.username}. They will need to complete it to gain server access.`,
                ephemeral: true
            });

            logger.info(`Join form sent to user ${user.username} (${user.id})`);

        } catch (error) {
            logger.error('Failed to send join form to user:', error);
            await interaction.reply({
                content: `Failed to send join form to ${user.username}. They may have DMs disabled.`,
                ephemeral: true
            });
        }

    } catch (error) {
        logger.error('Error in joinform command:', error);
        await interaction.reply({
            content: 'An error occurred while processing the join form.',
            ephemeral: true
        });
    }
};
