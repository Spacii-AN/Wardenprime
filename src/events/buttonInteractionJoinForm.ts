import { Events, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Event } from '../types/discord.d';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';

export const name = Events.InteractionCreate;
export const once = false;

export const execute: Event<typeof Events.InteractionCreate>['execute'] = async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'join_form_button') return;

    try {
        // Get join form configuration
        const config = await pgdb.getJoinFormConfig(interaction.guild.id);
        
        if (!config || !config.enabled) {
            await interaction.reply({
                content: '❌ Join form is not currently enabled for this server.',
                ephemeral: true
            });
            return;
        }

        // Check if user already has a pending submission
        const existingSubmission = await pgdb.query(
            `SELECT * FROM join_forms WHERE user_id = $1 AND status = 'pending'`,
            [interaction.user.id]
        );

        if (existingSubmission.length > 0) {
            await interaction.reply({
                content: '❌ You already have a pending join form submission. Please wait for it to be reviewed.',
                ephemeral: true
            });
            return;
        }

        // Get form fields from configuration or use defaults
        const formFields = config.form_fields || getDefaultFormFields();
        
        // Create the modal
        const modal = new ModalBuilder()
            .setCustomId('join_form_modal')
            .setTitle('Join Form');

        // Add form fields dynamically
        for (const field of formFields) {
            const input = new TextInputBuilder()
                .setCustomId(field.id)
                .setLabel(field.label)
                .setStyle(field.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
                .setPlaceholder(field.placeholder)
                .setRequired(field.required)
                .setMaxLength(field.maxLength || 100);

            if (field.minLength) {
                input.setMinLength(field.minLength);
            }

            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
            modal.addComponents(row);
        }

        // Show the modal
        await interaction.showModal(modal);

    } catch (error) {
        logger.error('Error handling join form button interaction:', error);
        await interaction.reply({
            content: 'An error occurred while opening the join form.',
            ephemeral: true
        });
    }
};

function getDefaultFormFields() {
    return [
        {
            id: 'ign_input',
            label: 'In-Game Name',
            placeholder: 'Your in-game name such as "User#000"',
            required: true,
            style: 'short',
            maxLength: 50
        },
        {
            id: 'preferred_name_input',
            label: 'Preferred Name',
            placeholder: 'What you prefer to be called by',
            required: false,
            style: 'short',
            maxLength: 30
        },
        {
            id: 'platform_input',
            label: 'Platform',
            placeholder: 'PC, PlayStation, Xbox, Nintendo Switch',
            required: true,
            style: 'short',
            maxLength: 20
        },
        {
            id: 'age_confirm_input',
            label: 'Age Confirmation',
            placeholder: 'Type "yes" to confirm you are over 16',
            required: true,
            style: 'short',
            maxLength: 10
        }
    ];
}
