import { Events, ModalSubmitInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { Event } from '../types/discord.d';
import { logger } from '../utils/logger';
import { pgdb } from '../services/postgresDatabase';
import { getServerNickname } from '../utils/nicknameHelper';

export const name = Events.InteractionCreate;
export const once = false;

export const execute: Event<typeof Events.InteractionCreate>['execute'] = async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'join_form_modal') return;

    try {
        // Get join form configuration
        const config = await pgdb.getJoinFormConfig(interaction.guild.id);
        const formFields = config?.form_fields || getDefaultFormFields();
        
        // Collect form data dynamically
        const formData: Record<string, string> = {};
        for (const field of formFields) {
            try {
                formData[field.id] = interaction.fields.getTextInputValue(field.id);
            } catch (error) {
                // Field might not exist in the form, skip it
                continue;
            }
        }

        // Validate required fields
        for (const field of formFields) {
            if (field.required && (!formData[field.id] || formData[field.id].trim() === '')) {
                await interaction.reply({
                    content: `❌ The field "${field.label}" is required.`,
                    ephemeral: true
                });
                return;
            }
        }

        // Special validation for age confirmation
        if (formData.age_confirm_input && formData.age_confirm_input.toLowerCase() !== 'yes') {
            await interaction.reply({
                content: '❌ You must confirm you are over 16 to join this server.',
                ephemeral: true
            });
            return;
        }

        // Special validation for platform
        if (formData.platform_input) {
            const validPlatforms = ['pc', 'playstation', 'xbox', 'nintendo switch', 'ps4', 'ps5', 'xbox one', 'xbox series'];
            const platformLower = formData.platform_input.toLowerCase();
            if (!validPlatforms.some(p => platformLower.includes(p))) {
                await interaction.reply({
                    content: '❌ Please enter a valid platform (PC, PlayStation, Xbox, Nintendo Switch).',
                    ephemeral: true
                });
                return;
            }
        }

        // Store join form data in database
        try {
            await pgdb.query(
                `INSERT INTO join_forms (user_id, form_data, submitted_at, status)
                 VALUES ($1, $2, NOW(), 'pending')`,
                [interaction.user.id, JSON.stringify(formData)]
            );
        } catch (error) {
            logger.error('Error storing join form data:', error);
        }

        // Create success embed with dynamic fields
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Join Form Submitted Successfully!')
            .setDescription('Thank you for completing the join form. Your information has been submitted for review.')
            .setColor(0x00FF00)
            .setFooter({ text: 'You will receive a DM when your access is approved' })
            .setTimestamp();

        // Add form fields dynamically
        for (const field of formFields) {
            if (formData[field.id]) {
                const value = field.id === 'age_confirm_input' ? '✅ Confirmed' : formData[field.id];
                successEmbed.addFields({
                    name: field.label,
                    value: value,
                    inline: true
                });
            }
        }

        await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true
        });

        // Send DM to user with their information
        try {
            const dmChannel = await interaction.user.createDM();
            const dmEmbed = new EmbedBuilder()
                .setTitle('📋 Your Join Form Information')
                .setDescription('Here are the details you submitted:')
                .setColor(0x5865F2)
                .setFooter({ text: 'Keep this information for your records' })
                .setTimestamp();

            // Add form fields dynamically
            for (const field of formFields) {
                if (formData[field.id]) {
                    const value = field.id === 'age_confirm_input' ? '✅ Confirmed' : formData[field.id];
                    dmEmbed.addFields({
                        name: field.label,
                        value: value,
                        inline: true
                    });
                }
            }

            dmEmbed.addFields({
                name: 'Status',
                value: '⏳ Pending Review',
                inline: true
            });

            // Get server nickname for personalized greeting
            const serverNickname = await getServerNickname(interaction.client, interaction.guild!.id, interaction.user.id);
            const preferredName = formData.preferred_name_input || formData.ign_input || serverNickname;
            
            await dmChannel.send({
                content: `Hello ${preferredName}! Here are the details you submitted for server access:`,
                embeds: [dmEmbed]
            });

        } catch (error) {
            logger.error('Failed to send DM to user:', error);
        }

        // Notify moderators (if configured)
        try {
            const guild = interaction.guild;
            if (guild) {
                // Get notification channel from config
                const config = await pgdb.getJoinFormConfig(guild.id);
                let notificationChannel = null;

                if (config?.notification_channel_id) {
                    notificationChannel = guild.channels.cache.get(config.notification_channel_id);
                } else {
                    // Fallback to finding a mod channel
                    notificationChannel = guild.channels.cache.find(channel => 
                        channel.name.includes('mod') || 
                        channel.name.includes('admin') || 
                        channel.name.includes('staff')
                    );
                }

                if (notificationChannel && notificationChannel.isTextBased()) {
                    const modEmbed = new EmbedBuilder()
                        .setTitle('🆕 New Join Form Submission')
                        .setDescription(`A new member has submitted a join form and is awaiting approval.`)
                        .setColor(0xFFA500)
                        .setTimestamp();

                    // Add user info
                    modEmbed.addFields({
                        name: 'User',
                        value: `${interaction.user} (${interaction.user.tag})`,
                        inline: true
                    });

                    // Add form fields dynamically
                    for (const field of formFields) {
                        if (formData[field.id] && field.id !== 'age_confirm_input') {
                            modEmbed.addFields({
                                name: field.label,
                                value: formData[field.id],
                                inline: true
                            });
                        }
                    }

                    await notificationChannel.send({ embeds: [modEmbed] });
                }
            }
        } catch (error) {
            logger.error('Failed to notify moderators:', error);
        }

        logger.info(`Join form submitted by ${interaction.user.tag} (${interaction.user.id}): ${JSON.stringify(formData)}`);

    } catch (error) {
        logger.error('Error processing join form submission:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your form. Please try again later.',
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
