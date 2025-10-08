import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  Role,
  APIRole
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb } from '../../services/postgresDatabase';
import { logger } from '../../utils/logger';
import { createEmbed } from '../../utils/embedBuilder';
import { fetchArbitrationData, processArbitrationData, ArbitrationEntry } from '../../services/arbitrationService';

// Tier emoji mappings (copied from arby.ts command)
const TIER_EMOJIS: Record<string, string> = {
  'S': '<:S_:1362400790160871574>',
  'A': '<:A_:1362400688599994461>',
  'B': '<:B_:1362400717444481094>',
  'C': '<:C_:1362400738852208722>',
  'D': '<:D_:1362400752869572829>',
  'F': '<:F_:1362400771521646725>'
};

// Command definition
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setarby')
    .setDescription('Set a channel to receive automatic Arbitration notifications')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('The channel to send Arbitration updates to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption(option =>
      option.setName('s_tier_role')
        .setDescription('Role to ping for S tier arbitrations')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('a_tier_role')
        .setDescription('Role to ping for A tier arbitrations')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('b_tier_role')
        .setDescription('Role to ping for B tier arbitrations')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('c_tier_role')
        .setDescription('Role to ping for C tier arbitrations')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('d_tier_role')
        .setDescription('Role to ping for D tier arbitrations')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('f_tier_role')
        .setDescription('Role to ping for F tier arbitrations')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply().catch(error => {
      logger.error('Error deferring reply in setarby command:', error);
      return; // Continue execution even if defer fails
    });
    
    try {
      const channel = interaction.options.getChannel('channel', true);
      const sTierRole = interaction.options.getRole('s_tier_role');
      const aTierRole = interaction.options.getRole('a_tier_role');
      const bTierRole = interaction.options.getRole('b_tier_role');
      const cTierRole = interaction.options.getRole('c_tier_role');
      const dTierRole = interaction.options.getRole('d_tier_role');
      const fTierRole = interaction.options.getRole('f_tier_role');
      const guildId = interaction.guildId;
      
      if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      // Update database in the background to avoid blocking
      updateDatabaseConfig(
        guildId, 
        channel.id, 
        sTierRole, 
        aTierRole, 
        bTierRole, 
        cTierRole, 
        dTierRole, 
        fTierRole
      ).catch(error => {
        logger.error('Error updating arbitration database config:', error);
      });
      
      // Fetch arbitration data with a timeout to prevent hanging
      let arbyData: ArbitrationEntry[] | null = null;
      try {
        const fetchPromise = fetchArbitrationData();
        const timeoutPromise = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Arbitration data fetch timed out')), 15000)
        );
        
        arbyData = await Promise.race([fetchPromise, timeoutPromise]) as ArbitrationEntry[] | null;
        
        if (!arbyData) {
          throw new Error('Failed to fetch arbitration data');
        }
      } catch (fetchError) {
        logger.error('Error fetching arbitration data:', fetchError);
        // Continue with command but inform the user
        await interaction.editReply({
          content: 'Successfully configured arbitration notifications, but could not fetch current arbitration data. Notifications will work for future arbitrations.',
          embeds: [createConfigSuccessEmbed(channel, sTierRole, aTierRole, bTierRole, cTierRole, dTierRole, fTierRole)]
        });
        return;
      }
      
      // Get current time in seconds
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Find current arbitration
      const currentIndex = arbyData.findIndex((arby: ArbitrationEntry) => 
        arby.timestamp <= currentTime && currentTime < arby.timestamp + 3600
      );
      
      if (currentIndex === -1) {
        await interaction.editReply({
          content: 'Successfully configured arbitration notifications, but could not determine the current arbitration. Notifications will work for future arbitrations.',
          embeds: [createConfigSuccessEmbed(channel, sTierRole, aTierRole, bTierRole, cTierRole, dTierRole, fTierRole)]
        });
        return;
      }
      
      // Process arbitration data with efficient chunking to avoid memory issues
      try {
        const currentArby = await processArbitrationData(arbyData[currentIndex]);
        
        // Process upcoming arbitrations (next 3)
        const upcomingArbyPromises = arbyData
          .slice(currentIndex + 1, currentIndex + 4)
          .map(arby => processArbitrationData(arby));
        const upcomingArbitrations = await Promise.all(upcomingArbyPromises);
        
        // For two weeks data, process in smaller batches for memory efficiency
        const twoWeeksEndIndex = arbyData.findIndex((arby) => 
          arby.timestamp > currentTime + (14 * 86400)
        ) || arbyData.length;
        
        // Set of node IDs we've already displayed
        const displayedNodes = new Set([
          currentArby.node,
          ...upcomingArbitrations.map(arby => arby.node)
        ]);
        
        // Find S and A tier arbitrations for the noteworthy section
        const noteworthyArbitrations = [];
        
        // Process data in chunks to avoid memory spikes
        const CHUNK_SIZE = 8; // Process in groups of 8
        const chunkCount = Math.ceil((twoWeeksEndIndex - (currentIndex + 4)) / CHUNK_SIZE);
        
        for (let i = 0; i < chunkCount; i++) {
          const startIdx = currentIndex + 4 + (i * CHUNK_SIZE);
          const endIdx = Math.min(startIdx + CHUNK_SIZE, twoWeeksEndIndex);
          
          // Process this chunk
          const chunkPromises = arbyData
            .slice(startIdx, endIdx)
            .map(arby => processArbitrationData(arby));
          
          const processedChunk = await Promise.all(chunkPromises);
          
          // Filter for S and A tiers not already displayed
          const noteworthyFromChunk = processedChunk.filter(arby => 
            (arby.tier === 'S' || arby.tier === 'A') && !displayedNodes.has(arby.node)
          );
          
          // Add to our collection and track displayed nodes
          for (const arby of noteworthyFromChunk) {
            noteworthyArbitrations.push(arby);
            displayedNodes.add(arby.node);
          }
          
          // If we already have enough, stop processing
          if (noteworthyArbitrations.length >= 5) {
            break;
          }
        }
        
        // Limit to top 5 noteworthy
        const limitedNoteworthy = noteworthyArbitrations.slice(0, 5);
        
        // Create the embed for display
        const arbyEmbed = createEmbed({
          type: 'info',
          title: `${currentArby.tier} Tier | ${currentArby.nodeName} (${currentArby.systemName})`,
          description: `Arbi Ends <t:${currentArby.endTimestamp}:R>`,
          fields: [
            {
              name: 'Enemy',
              value: currentArby.faction,
              inline: true
            },
            {
              name: 'Mission type',
              value: currentArby.missionType,
              inline: true
            },
            {
              name: 'Upcoming Arbitrations',
              value: upcomingArbitrations.length > 0 
                ? upcomingArbitrations.map(arby => 
                  `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
                ).join('\n')
                : 'No upcoming arbitrations found',
              inline: false
            },
            {
              name: 'Noteworthy Arbitrations',
              value: limitedNoteworthy.length > 0 
                ? limitedNoteworthy.map(arby => 
                  `${TIER_EMOJIS[arby.tier]} **Tier | ${arby.nodeName}** (**${arby.systemName}**) <t:${arby.timestamp}:R>`
                ).join('\n')
                : 'No noteworthy arbitrations found in the next two weeks',
              inline: false
            }
          ],
          thumbnail: 'https://browse.wf/Lotus/Interface/Icons/StoreIcons/Resources/CraftingComponents/Elitium.png',
          timestamp: true
        });
        
        // Determine if we should ping a role based on current tier
        let mentionString = '';
        const tierRoleMap = {
          'S': sTierRole,
          'A': aTierRole,
          'B': bTierRole,
          'C': cTierRole,
          'D': dTierRole,
          'F': fTierRole
        };
        
        const roleForCurrentTier = tierRoleMap[currentArby.tier as keyof typeof tierRoleMap];
        if (roleForCurrentTier) {
          mentionString = `<@&${roleForCurrentTier.id}> ${currentArby.tier} Tier Arbitration is active!\n`;
        }
        
        // Send the embed to the target channel
        if (mentionString) {
          await (channel as TextChannel).send({ content: mentionString, embeds: [arbyEmbed] });
        } else {
          await (channel as TextChannel).send({ embeds: [arbyEmbed] });
        }
        
        logger.info(`Sent initial arbitration message to channel ${channel.name} (${channel.id})`);
        
        // Let the user know it worked
        await interaction.editReply({
          embeds: [createConfigSuccessEmbed(channel, sTierRole, aTierRole, bTierRole, cTierRole, dTierRole, fTierRole)]
        });
        
      } catch (processError) {
        logger.error('Error processing arbitration data:', processError);
        // Let the user know configuration worked but display failed
        await interaction.editReply({
          content: 'Successfully configured arbitration notifications, but encountered an error displaying current arbitrations. Notifications will work for future arbitrations.',
          embeds: [createConfigSuccessEmbed(channel, sTierRole, aTierRole, bTierRole, cTierRole, dTierRole, fTierRole)]
        });
      }
    } catch (error) {
      logger.error('Error in setarby command:', error);
      
      try {
        // Attempt to reply with error
        await interaction.editReply('An error occurred while setting up Arbitration notifications. Please try again later.').catch(() => {
          logger.error('Failed to send error message in setarby command');
        });
      } catch (replyError) {
        logger.error('Failed to reply with error in setarby command:', replyError);
      }
    }
    
    // Log command completion
    logger.info('[COMMAND] Completed: setarby');
  }
};

/**
 * Update the database configuration for arbitration notifications
 */
async function updateDatabaseConfig(
  guildId: string,
  channelId: string,
  sTierRole: Role | APIRole | null | undefined,
  aTierRole: Role | APIRole | null | undefined,
  bTierRole: Role | APIRole | null | undefined,
  cTierRole: Role | APIRole | null | undefined,
  dTierRole: Role | APIRole | null | undefined,
  fTierRole: Role | APIRole | null | undefined
): Promise<void> {
  // Get existing notifications for this guild
  const existingConfigs = await pgdb.getArbitrationNotifications();
  const existingConfig = existingConfigs.find(config => config.guild_id === guildId);
  
  if (existingConfig) {
    // Update existing configuration in PostgreSQL
    await pgdb.query(
      `UPDATE arbitration_notifications SET 
       channel_id = $1,
       s_tier_role_id = $2,
       a_tier_role_id = $3,
       b_tier_role_id = $4, 
       c_tier_role_id = $5,
       d_tier_role_id = $6,
       f_tier_role_id = $7,
       updated_at = NOW()
       WHERE guild_id = $8`,
      [
        channelId,
        sTierRole?.id || null,
        aTierRole?.id || null,
        bTierRole?.id || null,
        cTierRole?.id || null,
        dTierRole?.id || null,
        fTierRole?.id || null,
        guildId
      ]
    );
    
    logger.info(`Updated arbitration notifications channel for guild ${guildId} to ${channelId} with role pings`);
  } else {
    // Add a new notification to PostgreSQL
    await pgdb.addArbitrationNotification(
      guildId,
      channelId, 
      null, // role_id
      null, // message_id
      sTierRole?.id || null,
      aTierRole?.id || null,
      bTierRole?.id || null,
      cTierRole?.id || null,
      dTierRole?.id || null,
      fTierRole?.id || null
    );
    
    logger.info(`Set arbitration notifications channel for guild ${guildId} to ${channelId} with role pings`);
  }
}

/**
 * Create a success embed for configuration
 */
function createConfigSuccessEmbed(
  channel: any,
  sTierRole: Role | APIRole | null | undefined,
  aTierRole: Role | APIRole | null | undefined,
  bTierRole: Role | APIRole | null | undefined,
  cTierRole: Role | APIRole | null | undefined,
  dTierRole: Role | APIRole | null | undefined,
  fTierRole: Role | APIRole | null | undefined
) {
  return createEmbed({
    type: 'success',
    title: 'Arbitration Notifications Set',
    description: `Warframe Arbitration updates will now be automatically posted in ${channel}.`,
    fields: [
      {
        name: 'Channel',
        value: `<#${channel.id}>`,
        inline: true
      },
      {
        name: 'Role Pings',
        value: [
          sTierRole ? `S Tier: <@&${sTierRole.id}>` : null,
          aTierRole ? `A Tier: <@&${aTierRole.id}>` : null,
          bTierRole ? `B Tier: <@&${bTierRole.id}>` : null,
          cTierRole ? `C Tier: <@&${cTierRole.id}>` : null,
          dTierRole ? `D Tier: <@&${dTierRole.id}>` : null,
          fTierRole ? `F Tier: <@&${fTierRole.id}>` : null
        ].filter(Boolean).join('\n') || 'No role pings configured',
        inline: true
      }
    ],
    timestamp: true
  });
}

export = command; 