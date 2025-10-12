import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../../types/discord.d';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';

export const data = new SlashCommandBuilder()
    .setName('joinformreview')
    .setDescription('Review pending join form submissions')
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all pending join form submissions')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('approve')
            .setDescription('Approve a join form submission')
            .addStringOption(option =>
                option
                    .setName('user_id')
                    .setDescription('The user ID to approve')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('notes')
                    .setDescription('Optional notes for the approval')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('deny')
            .setDescription('Deny a join form submission')
            .addStringOption(option =>
                option
                    .setName('user_id')
                    .setDescription('The user ID to deny')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('reason')
                    .setDescription('Reason for denial')
                    .setRequired(true)
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute: Command['execute'] = async (interaction) => {
    try {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            await handleListSubmissions(interaction);
        } else if (subcommand === 'approve') {
            await handleApproveSubmission(interaction);
        } else if (subcommand === 'deny') {
            await handleDenySubmission(interaction);
        }

    } catch (error) {
        logger.error('Error in joinformreview command:', error);
        await interaction.reply({
            content: 'An error occurred while processing the command.',
            ephemeral: true
        });
    }
};

async function handleListSubmissions(interaction: any) {
    try {
        const pendingForms = await pgdb.query(
            `SELECT * FROM join_forms WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT 10`
        );

        if (pendingForms.length === 0) {
            await interaction.reply({
                content: 'No pending join form submissions found.',
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Pending Join Form Submissions')
            .setDescription(`Found ${pendingForms.length} pending submission(s)`)
            .setColor(0xFFA500)
            .setTimestamp();

        for (const form of pendingForms) {
            const formData = JSON.parse(form.form_data || '{}');
            embed.addFields({
                name: `User: <@${form.user_id}>`,
                value: `**IGN:** ${formData.ign_input || 'N/A'}\n**Preferred Name:** ${formData.preferred_name_input || 'N/A'}\n**Platform:** ${formData.platform_input || 'N/A'}\n**Submitted:** <t:${Math.floor(new Date(form.submitted_at).getTime() / 1000)}:R>`,
                inline: true
            });
        }

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error listing join form submissions:', error);
        await interaction.reply({
            content: 'Failed to retrieve join form submissions.',
            ephemeral: true
        });
    }
}

async function handleApproveSubmission(interaction: any) {
    try {
        const userId = interaction.options.getString('user_id', true);
        const notes = interaction.options.getString('notes') || 'No notes provided';

        // Update the join form status
        await pgdb.query(
            `UPDATE join_forms 
             SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1, notes = $2 
             WHERE user_id = $3 AND status = 'pending'`,
            [interaction.user.id, notes, userId]
        );

        // Try to get the user and assign roles
        try {
            const member = await interaction.guild.members.fetch(userId);
            
            // You can add role assignment logic here
            // For example, assign a "Member" role
            // const memberRole = interaction.guild.roles.cache.find(role => role.name === 'Member');
            // if (memberRole) {
            //     await member.roles.add(memberRole);
            // }

            const embed = new EmbedBuilder()
                .setTitle('✅ Join Form Approved')
                .setDescription(`Join form for <@${userId}> has been approved.`)
                .addFields(
                    { name: 'Approved by', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Notes', value: notes, inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            // Send DM to the approved user
            try {
                const user = await interaction.client.users.fetch(userId);
                const dmChannel = await user.createDM();
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 Welcome to the Server!')
                    .setDescription('Your join form has been approved! You now have access to the server.')
                    .setColor(0x00FF00)
                    .setTimestamp();

                await dmChannel.send({
                    content: `Hello! Great news - your join form has been approved by our staff!`,
                    embeds: [dmEmbed]
                });
            } catch (dmError) {
                logger.error('Failed to send approval DM:', dmError);
            }

        } catch (memberError) {
            logger.error('Failed to fetch member for approval:', memberError);
            await interaction.reply({
                content: `Join form approved but failed to process member. User ID: ${userId}`,
                ephemeral: true
            });
        }

    } catch (error) {
        logger.error('Error approving join form:', error);
        await interaction.reply({
            content: 'Failed to approve join form submission.',
            ephemeral: true
        });
    }
}

async function handleDenySubmission(interaction: any) {
    try {
        const userId = interaction.options.getString('user_id', true);
        const reason = interaction.options.getString('reason', true);

        // Update the join form status
        await pgdb.query(
            `UPDATE join_forms 
             SET status = 'denied', reviewed_at = NOW(), reviewed_by = $1, notes = $2 
             WHERE user_id = $3 AND status = 'pending'`,
            [interaction.user.id, reason, userId]
        );

        const embed = new EmbedBuilder()
            .setTitle('❌ Join Form Denied')
            .setDescription(`Join form for <@${userId}> has been denied.`)
            .addFields(
                { name: 'Denied by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: true }
            )
            .setColor(0xFF0000)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        // Send DM to the denied user
        try {
            const user = await interaction.client.users.fetch(userId);
            const dmChannel = await user.createDM();
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ Join Form Denied')
                .setDescription('Unfortunately, your join form has been denied.')
                .addFields(
                    { name: 'Reason', value: reason, inline: false }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await dmChannel.send({
                content: `Hello, we've reviewed your join form application.`,
                embeds: [dmEmbed]
            });
        } catch (dmError) {
            logger.error('Failed to send denial DM:', dmError);
        }

    } catch (error) {
        logger.error('Error denying join form:', error);
        await interaction.reply({
            content: 'Failed to deny join form submission.',
            ephemeral: true
        });
    }
}
