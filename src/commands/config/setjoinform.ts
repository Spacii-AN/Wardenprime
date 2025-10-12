import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { Command } from '../../types/discord.d';
import { logger } from '../../utils/logger';
import { pgdb } from '../../services/postgresDatabase';

export const data = new SlashCommandBuilder()
    .setName('setjoinform')
    .setDescription('Configure join form settings')
    .addSubcommand(subcommand =>
        subcommand
            .setName('channel')
            .setDescription('Set the channel for join form notifications')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel for join form notifications')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
                )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('role')
            .setDescription('Set the role to assign after approval')
            .addRoleOption(option =>
                option
                    .setName('role')
                    .setDescription('Role to assign after join form approval')
                    .setRequired(true)
                )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Enable or disable join form requirement')
            .addBooleanOption(option =>
                option
                    .setName('enabled')
                    .setDescription('Enable or disable join form requirement')
                    .setRequired(true)
                )
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute: Command['execute'] = async (interaction) => {
    try {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'channel') {
            await handleSetChannel(interaction);
        } else if (subcommand === 'role') {
            await handleSetRole(interaction);
        } else if (subcommand === 'status') {
            await handleSetStatus(interaction);
        }

    } catch (error) {
        logger.error('Error in setjoinform command:', error);
        await interaction.reply({
            content: 'An error occurred while configuring join form settings.',
            ephemeral: true
        });
    }
};

async function handleSetChannel(interaction: any) {
    try {
        const channel = interaction.options.getChannel('channel', true);

        // Update guild settings with join form channel
        await pgdb.query(
            `INSERT INTO guild_settings (guild_id, join_form_channel_id) 
             VALUES ($1, $2) 
             ON CONFLICT (guild_id) 
             DO UPDATE SET join_form_channel_id = $2, updated_at = NOW()`,
            [interaction.guild.id, channel.id]
        );

        await interaction.reply({
            content: `✅ Join form notifications will be sent to ${channel}`,
            ephemeral: true
        });

        logger.info(`Join form channel set to ${channel.id} for guild ${interaction.guild.id}`);

    } catch (error) {
        logger.error('Error setting join form channel:', error);
        await interaction.reply({
            content: 'Failed to set join form channel.',
            ephemeral: true
        });
    }
}

async function handleSetRole(interaction: any) {
    try {
        const role = interaction.options.getRole('role', true);

        // Update guild settings with join form role
        await pgdb.query(
            `INSERT INTO guild_settings (guild_id, join_form_role_id) 
             VALUES ($1, $2) 
             ON CONFLICT (guild_id) 
             DO UPDATE SET join_form_role_id = $2, updated_at = NOW()`,
            [interaction.guild.id, role.id]
        );

        await interaction.reply({
            content: `✅ New members will receive the ${role} role after join form approval`,
            ephemeral: true
        });

        logger.info(`Join form role set to ${role.id} for guild ${interaction.guild.id}`);

    } catch (error) {
        logger.error('Error setting join form role:', error);
        await interaction.reply({
            content: 'Failed to set join form role.',
            ephemeral: true
        });
    }
}

async function handleSetStatus(interaction: any) {
    try {
        const enabled = interaction.options.getBoolean('enabled', true);

        // Update guild settings with join form status
        await pgdb.query(
            `INSERT INTO guild_settings (guild_id, join_form_enabled) 
             VALUES ($1, $2) 
             ON CONFLICT (guild_id) 
             DO UPDATE SET join_form_enabled = $2, updated_at = NOW()`,
            [interaction.guild.id, enabled]
        );

        const statusText = enabled ? 'enabled' : 'disabled';
        await interaction.reply({
            content: `✅ Join form requirement has been ${statusText}`,
            ephemeral: true
        });

        logger.info(`Join form status set to ${enabled} for guild ${interaction.guild.id}`);

    } catch (error) {
        logger.error('Error setting join form status:', error);
        await interaction.reply({
            content: 'Failed to set join form status.',
            ephemeral: true
        });
    }
}
