import { 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  TextChannel,
  GuildMember,
  EmbedBuilder,
  ColorResolvable,
  time
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb, Giveaway } from '../../services/postgresDatabase';
import { createEmbed, Colors } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { parseTimeString, getRelativeTime, getFutureDate } from '../../utils/timeParser';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new giveaway')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway early')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the giveaway')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll the winners of a giveaway')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the giveaway')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('winners')
            .setDescription('Number of winners to reroll (defaults to original amount)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List active giveaways in this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a giveaway')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('Message ID of the giveaway')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents) as SlashCommandBuilder,
  
  cooldown: 5,
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Check if in guild
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'This command can only be used in a server.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    if (!pgdb) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Database Error',
          description: 'Database connection is not available',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    // Handle based on subcommand
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'create':
        await handleCreateCommand(interaction);
        break;
      case 'end':
        await handleEndCommand(interaction);
        break;
      case 'reroll':
        await handleRerollCommand(interaction);
        break;
      case 'list':
        await handleListCommand(interaction);
        break;
      case 'delete':
        await handleDeleteCommand(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'Invalid subcommand',
            timestamp: true
          })],
          ephemeral: true
        });
    }
  }
};

/**
 * Create a giveaway embed
 */
export function createGiveawayEmbed(giveaway: Giveaway, ended = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 GIVEAWAY: ${giveaway.prize}`)
    .setColor(Colors.PRIMARY)
    .setAuthor({
      name: ' ',
      iconURL: 'https://media.discordapp.net/attachments/1361740378599850233/1361744710300995797/98dcd7a2-9f17-4ef5-b153-7159980343c0.png?ex=67ffdf16&is=67fe8d96&hm=bb7cc70c73ee45b7b3918a73e92991ec528c2a3d5f757c929e5fe0f4c0edb603&=&format=webp&quality=lossless&width=2048&height=2048'
    })
    .setFooter({ text: `Giveaway ID: ${giveaway.id}` })
    .setTimestamp();
  
  // Only set description if it's not empty
  if (giveaway.description && giveaway.description.trim().length > 0) {
    embed.setDescription(giveaway.description);
  }
  
  embed.addFields(
    { name: '🏆 Winners', value: `${giveaway.winners_count}`, inline: true },
    { name: '👥 Entries', value: `${giveaway.participants_count || 0}`, inline: true }
  );
  
  if (ended) {
    if (giveaway.winners && giveaway.winners.length > 0) {
      const winnerMentions = giveaway.winners.map(id => `<@${id}>`).join(', ');
      embed.setColor(Colors.SUCCESS);
      embed.setTitle(`🎉 GIVEAWAY ENDED: ${giveaway.prize}`);
      embed.addFields({ 
        name: '🎊 Winners', 
        value: winnerMentions,
        inline: false 
      });
      
      // Make the winners more prominent
      if (giveaway.description && giveaway.description.trim().length > 0) {
        embed.setDescription(giveaway.description + `\n\n**Congratulations to the winner${giveaway.winners.length > 1 ? 's' : ''}!**`);
      } else {
        embed.setDescription(`**Congratulations to the winner${giveaway.winners.length > 1 ? 's' : ''}!**`);
      }
    } else {
      embed.setColor(Colors.ERROR);
      embed.setTitle(`🎉 GIVEAWAY ENDED: ${giveaway.prize}`);
      embed.addFields({ 
        name: '🎊 Winners', 
        value: 'No valid participants',
        inline: false 
      });
    }
  } else {
    const endsAt = new Date(giveaway.ends_at);
    
    // Check if it ends in less than 10 seconds
    const timeUntilEnd = endsAt.getTime() - Date.now();
    let endsValue = `${time(endsAt, 'R')} (${time(endsAt, 'f')})`;
    
    // Add countdown for short times and make it more prominent
    if (timeUntilEnd < 10000 && timeUntilEnd > 0) {
      endsValue = `**${time(endsAt, 'R')}** (Ending soon!)`;
    }
    
    embed.addFields(
      { name: '⏰ Ends', value: endsValue, inline: false }
    );
    
    if (giveaway.requirement && giveaway.requirement.trim().length > 0) {
      embed.addFields({ name: '📋 Requirement', value: giveaway.requirement, inline: false });
    }
  }
  
  return embed;
}

/**
 * Create giveaway action row with buttons
 */
export function createGiveawayActionRow(giveaway: Giveaway, ended = false): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  if (!ended) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_enter_${giveaway.id}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎉')
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_reroll_${giveaway.id}`)
        .setLabel('Reroll')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(!ended)
    );
  }
  
  return row;
}

/**
 * Handles the create command to start a new giveaway
 */
async function handleCreateCommand(interaction: ChatInputCommandInteraction) {
  // Create the modal for giveaway creation
  const modal = new ModalBuilder()
    .setCustomId('giveaway_create_modal')
    .setTitle('Create a Giveaway');
  
  // Prize input
  const prizeInput = new TextInputBuilder()
    .setCustomId('prize')
    .setLabel('Prize (required)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('What are you giving away?')
    .setRequired(true)
    .setMaxLength(256);
  
  // Description input
  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter details about the prize')
    .setRequired(false)
    .setMaxLength(1000);
  
  // Winners count input
  const winnersInput = new TextInputBuilder()
    .setCustomId('winners')
    .setLabel('Number of Winners (1-20)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('1')
    .setValue('1')
    .setRequired(true)
    .setMaxLength(2);
  
  // Duration input
  const durationInput = new TextInputBuilder()
    .setCustomId('duration')
    .setLabel('Duration (e.g. 1s, 1m, 1h, 1d, 1w, 1M)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('24h')
    .setValue('24h')
    .setRequired(true);
  
  // Requirement input
  const requirementInput = new TextInputBuilder()
    .setCustomId('requirement')
    .setLabel('Requirement (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Any requirements to enter the giveaway')
    .setRequired(false)
    .setMaxLength(1000);
  
  // Add components to the modal
  const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(prizeInput);
  const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(winnersInput);
  const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);
  const fifthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(requirementInput);
  
  modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);
  
  // Show the modal
  await interaction.showModal(modal);
}

/**
 * Handles the end command to end a giveaway early
 */
async function handleEndCommand(interaction: ChatInputCommandInteraction) {
  try {
    const messageId = interaction.options.getString('message_id', true);
    await interaction.deferReply({ ephemeral: true });
    
    // Get the giveaway
    const giveaway = await pgdb.getGiveawayByMessageId(messageId);
    
    if (!giveaway) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'No giveaway found with that message ID.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check if giveaway is already ended
    if (giveaway.ended) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'This giveaway has already ended.',
          timestamp: true
        })]
      });
      return;
    }
    
    // End the giveaway
    const winners = await pgdb.endGiveaway(giveaway.id);
    logger.info(`Giveaway ${giveaway.id} ended with winners: ${winners.join(', ') || 'none'}`);
    
    // Update the giveaway message
    const channel = await interaction.guild!.channels.fetch(giveaway.channel_id) as TextChannel;
    if (!channel) {
      throw new Error('Channel not found');
    }
    
    const message = await channel.messages.fetch(giveaway.message_id!);
    if (!message) {
      throw new Error('Message not found');
    }
    
    // Get updated giveaway data
    const updatedGiveaway = await pgdb.getGiveawayById(giveaway.id);
    if (!updatedGiveaway) {
      throw new Error('Failed to get updated giveaway data');
    }
    
    // Ensure winners are included in the updatedGiveaway object
    if (!updatedGiveaway.winners) {
      updatedGiveaway.winners = winners;
      logger.info(`Manually added winners to updatedGiveaway object: ${winners.join(', ') || 'none'}`);
    }
    
    logger.info(`Updating giveaway message with winners: ${updatedGiveaway.winners?.join(', ') || 'none'}`);
    
    // Update the message with the ended embed
    await message.edit({
      embeds: [createGiveawayEmbed(updatedGiveaway, true)],
      components: [createGiveawayActionRow(updatedGiveaway, true)]
    });
    
    // Send a message to announce the winners
    if (winners.length > 0) {
      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
      await channel.send({
        content: `🎉 Congratulations ${winnerMentions}! You won **${updatedGiveaway.prize}**!`,
        allowedMentions: { users: winners }
      });
    } else {
      await channel.send(`No winners could be determined for the giveaway **${updatedGiveaway.prize}**.`);
    }
    
    // Reply to the interaction
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'Giveaway Ended',
        description: `Successfully ended the giveaway for **${updatedGiveaway.prize}**.`,
        timestamp: true
      })]
    });
    
    logger.info(`Giveaway ${giveaway.id} ended by ${interaction.user.tag} (${interaction.user.id})`);
  } catch (error) {
    logger.error(`Error ending giveaway:`, error);
    
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

/**
 * Handles the reroll command to pick new winners
 */
async function handleRerollCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const messageId = interaction.options.getString('message_id');
    const winnersCount = interaction.options.getInteger('winners');
    
    if (!messageId) {
      return await interaction.editReply({
        content: '❌ Please provide a message ID to reroll.'
      });
    }
    
    // Get the giveaway from the message ID
    const giveaway = await pgdb.getGiveawayByMessageId(messageId);
    
    if (!giveaway) {
      return await interaction.editReply({
        content: '❌ Could not find a giveaway with that message ID.'
      });
    }
    
    if (!giveaway.ended) {
      return await interaction.editReply({
        content: '❌ You can only reroll ended giveaways.'
      });
    }
    
    // Reroll the giveaway and get the winners
    const newWinners = await pgdb.rerollGiveaway(giveaway.id, winnersCount);
    
    // Get the channel to update the message
    const channel = interaction.guild?.channels.cache.get(giveaway.channel_id) as TextChannel;
    
    if (!channel) {
      return await interaction.editReply({
        content: '❌ Could not find the channel for this giveaway.'
      });
    }
    
    // Get the updated giveaway with winners
    const updatedGiveaway = await pgdb.getGiveawayById(giveaway.id);
    
    if (!updatedGiveaway) {
      return await interaction.editReply({
        content: '❌ Failed to get updated giveaway data.'
      });
    }
    
    // Make sure winners are included
    if (!updatedGiveaway.winners || updatedGiveaway.winners.length === 0) {
      updatedGiveaway.winners = newWinners;
    }
    
    // Update the giveaway message
    try {
      const message = await channel.messages.fetch(giveaway.message_id as string);
      
      await message.edit({
        embeds: [createGiveawayEmbed(updatedGiveaway, true)],
        components: [createGiveawayActionRow(updatedGiveaway, true)]
      });
      
      // Send a message announcing the reroll
      if (newWinners.length > 0) {
        const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');
        await channel.send({
          content: `**REROLL!** 🎉 Congratulations ${winnerMentions}! You won **${updatedGiveaway.prize}**!`,
          allowedMentions: { users: newWinners }
        });
      } else {
        await channel.send(`**REROLL!** No winners could be determined for the giveaway **${updatedGiveaway.prize}**.`);
      }
      
      await interaction.editReply({
        content: `✅ Successfully rerolled the giveaway! ${newWinners.length > 0 ? 
          `New winners: ${newWinners.map(id => `<@${id}>`).join(', ')}` : 
          'No winners were selected.'}`
      });
    } catch (error) {
      logger.error('Error updating giveaway message for reroll:', error);
      return await interaction.editReply({
        content: `❌ There was an error updating the giveaway message: ${error}`
      });
    }
  } catch (error) {
    logger.error('Error in giveaway reroll command:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: `❌ There was an error rerolling the giveaway: ${error}`
      });
    }
  }
}

/**
 * Handles the list command to show active giveaways
 */
async function handleListCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get all active giveaways for this guild
    const giveaways = await pgdb.getActiveGiveawaysForGuild(interaction.guildId!);
    
    if (giveaways.length === 0) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'info',
          title: 'No Active Giveaways',
          description: 'There are no active giveaways in this server.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Create an embed to show the giveaways
    const embed = createEmbed({
      title: 'Active Giveaways',
      description: `There ${giveaways.length === 1 ? 'is' : 'are'} ${giveaways.length} active giveaway${giveaways.length === 1 ? '' : 's'} in this server.`,
      timestamp: true
    });
    
    // Add fields for each giveaway
    for (const giveaway of giveaways) {
      const channel = interaction.guild!.channels.cache.get(giveaway.channel_id);
      const endsAt = new Date(giveaway.ends_at);
      
      embed.addFields({
        name: giveaway.prize,
        value: [
          `**Channel:** ${channel ? `<#${channel.id}>` : 'Unknown'}`,
          `**Winners:** ${giveaway.winners_count}`,
          `**Ends:** ${time(endsAt, 'R')}`,
          `**Entries:** ${giveaway.participants_count || 0}`,
          `**Message:** [Jump to Giveaway](https://discord.com/channels/${giveaway.guild_id}/${giveaway.channel_id}/${giveaway.message_id})`
        ].join('\n'),
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error listing giveaways:`, error);
    
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

/**
 * Handles the delete command to remove a giveaway
 */
async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  try {
    const messageId = interaction.options.getString('message_id', true);
    
    await interaction.deferReply({ ephemeral: true });
    
    // Get the giveaway
    const giveaway = await pgdb.getGiveawayByMessageId(messageId);
    
    if (!giveaway) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'No giveaway found with that message ID.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_delete_confirm_${giveaway.id}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('giveaway_delete_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Send confirmation message
    const response = await interaction.editReply({
      embeds: [createEmbed({
        type: 'warning',
        title: 'Confirm Deletion',
        description: `Are you sure you want to delete the giveaway for **${giveaway.prize}**? This action cannot be undone.`,
        timestamp: true
      })],
      components: [row]
    });
    
    // Set up collector for button interactions
    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60000 // 1 minute
    });
    
    collector.on('collect', async i => {
      if (i.customId === `giveaway_delete_confirm_${giveaway.id}`) {
        await i.deferUpdate();
        
        // Delete the giveaway
        const success = await pgdb.deleteGiveaway(giveaway.id);
        
        if (success) {
          // Try to delete the message
          try {
            const channel = await interaction.guild!.channels.fetch(giveaway.channel_id) as TextChannel;
            if (channel) {
              const message = await channel.messages.fetch(giveaway.message_id!);
              if (message) {
                await message.delete();
              }
            }
          } catch (error) {
            logger.warn(`Could not delete giveaway message: ${error}`);
          }
          
          await i.editReply({
            embeds: [createEmbed({
              type: 'success',
              title: 'Giveaway Deleted',
              description: `Successfully deleted the giveaway for **${giveaway.prize}**.`,
              timestamp: true
            })],
            components: []
          });
          
          logger.info(`Giveaway ${giveaway.id} deleted by ${interaction.user.tag} (${interaction.user.id})`);
        } else {
          await i.editReply({
            embeds: [createEmbed({
              type: 'error',
              title: 'Error',
              description: 'Failed to delete the giveaway.',
              timestamp: true
            })],
            components: []
          });
        }
      } else if (i.customId === 'giveaway_delete_cancel') {
        await i.update({
          embeds: [createEmbed({
            type: 'info',
            title: 'Deletion Cancelled',
            description: 'The giveaway was not deleted.',
            timestamp: true
          })],
          components: []
        });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Disable all buttons when the collector times out
        row.components.forEach(component => {
          component.setDisabled(true);
        });
        
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'info',
            title: 'Deletion Cancelled',
            description: 'Timed out. The giveaway was not deleted.',
            timestamp: true
          })],
          components: [row]
        }).catch(() => {}); // Ignore errors if the message was deleted
      }
    });
  } catch (error) {
    logger.error(`Error deleting giveaway:`, error);
    
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

// Modal submit handler for the giveaway creation
export async function handleGiveawayCreateModal(interaction: ModalSubmitInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get modal inputs
    const prize = interaction.fields.getTextInputValue('prize');
    
    // Ensure empty strings are converted to null
    let description = interaction.fields.getTextInputValue('description');
    description = description.trim().length > 0 ? description : null;
    
    const winnersValue = interaction.fields.getTextInputValue('winners');
    const durationValue = interaction.fields.getTextInputValue('duration');
    
    // Ensure empty strings are converted to null
    let requirement = interaction.fields.getTextInputValue('requirement');
    requirement = requirement.trim().length > 0 ? requirement : null;
    
    // Parse winners count
    const winnersCount = parseInt(winnersValue);
    if (isNaN(winnersCount) || winnersCount < 1 || winnersCount > 20) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Invalid Winners Count',
          description: 'Please enter a valid number of winners between 1 and 20.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Parse duration
    const endsAt = getFutureDate(durationValue);
    if (!endsAt) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Invalid Duration',
          description: 'Please enter a valid duration (e.g. 1s, 1m, 1h, 1d, 1w, 1M).',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check if duration is too long
    const duration = endsAt.getTime() - Date.now();
    if (duration > 2592000000) { // More than 30 days
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Duration Too Long',
          description: 'Giveaway duration cannot exceed 30 days.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Create the giveaway in database
    const giveaway = await pgdb.createGiveaway(
      interaction.guildId!,
      interaction.channelId,
      interaction.user.id,
      prize,
      description,
      winnersCount,
      requirement,
      endsAt
    );
    
    // Create the embed and buttons
    const embed = createGiveawayEmbed(giveaway);
    const row = createGiveawayActionRow(giveaway);
    
    // Send the giveaway message
    const giveawayMessage = await interaction.channel!.send({
      embeds: [embed],
      components: [row]
    });
    
    // Update the giveaway with the message ID
    await pgdb.setGiveawayMessageId(giveaway.id, giveawayMessage.id);
    
    // Reply to the interaction
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'success',
        title: 'Giveaway Created',
        description: `Successfully created a giveaway for **${prize}**.`,
        timestamp: true
      })]
    });
    
    logger.info(`Giveaway ${giveaway.id} created by ${interaction.user.tag} (${interaction.user.id})`);
  } catch (error) {
    logger.error(`Error creating giveaway:`, error);
    
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

// Button interaction handler for giveaway entry
export async function handleGiveawayEnterButton(interaction: ButtonInteraction) {
  try {
    // Get the giveaway ID from the button custom ID
    const giveawayId = interaction.customId.split('_')[2];
    
    await interaction.deferReply({ ephemeral: true });
    
    // Get the giveaway
    const giveaway = await pgdb.getGiveawayById(giveawayId);
    
    if (!giveaway) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'This giveaway no longer exists.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check if giveaway has ended
    if (giveaway.ended) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Giveaway Ended',
          description: 'This giveaway has already ended.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check if the user is already a participant
    const isParticipant = await pgdb.isGiveawayParticipant(giveawayId, interaction.user.id);
    
    if (isParticipant) {
      // Instead of removing, inform the user they're already entered
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'info',
          title: 'Already Entered',
          description: `You have already entered the giveaway for **${giveaway.prize}**. Good luck!`,
          timestamp: true
        })]
      });
    } else {
      // Add the user to participants
      const success = await pgdb.addGiveawayParticipant(giveawayId, interaction.user.id);
      
      if (success) {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'success',
            title: 'Entered Giveaway',
            description: `You have entered the giveaway for **${giveaway.prize}**. Good luck!`,
            timestamp: true
          })]
        });
        
        // Update the giveaway message to reflect new participant count
        const updatedGiveaway = await pgdb.getGiveawayById(giveawayId);
        if (updatedGiveaway && interaction.message.editable) {
          await interaction.message.edit({
            embeds: [createGiveawayEmbed(updatedGiveaway)]
          });
        }
      } else {
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'Failed to enter you into the giveaway.',
            timestamp: true
          })]
        });
      }
    }
  } catch (error) {
    logger.error(`Error handling giveaway enter button:`, error);
    
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

// Button interaction handler for giveaway reroll
export async function handleGiveawayRerollButton(interaction: ButtonInteraction) {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) {
    await interaction.reply({
      content: '❌ You need the Manage Events permission to reroll giveaways.',
      ephemeral: true
    });
    return;
  }
  
  try {
    // Get the giveaway ID from the button custom ID
    const giveawayId = interaction.customId.split('_')[2];
    
    await interaction.deferReply({ ephemeral: true });
    
    // Get the giveaway
    const giveaway = await pgdb.getGiveawayById(giveawayId);
    
    if (!giveaway) {
      await interaction.editReply({
        content: '❌ This giveaway no longer exists.'
      });
      return;
    }
    
    // Check if giveaway has ended
    if (!giveaway.ended) {
      await interaction.editReply({
        content: '❌ You can only reroll ended giveaways.'
      });
      return;
    }
    
    // Reroll the giveaway
    const newWinners = await pgdb.rerollGiveaway(giveaway.id);
    
    // Get the channel
    const channel = interaction.channel as TextChannel;
    
    if (!channel) {
      await interaction.editReply({
        content: '❌ Failed to get channel information.'
      });
      return;
    }
    
    // Get updated giveaway data
    const updatedGiveaway = await pgdb.getGiveawayById(giveawayId);
    
    if (!updatedGiveaway) {
      await interaction.editReply({
        content: '❌ Failed to get updated giveaway data.'
      });
      return;
    }
    
    // Make sure winners are included
    if (!updatedGiveaway.winners || updatedGiveaway.winners.length === 0) {
      updatedGiveaway.winners = newWinners;
    }
    
    // Update the giveaway message
    if (interaction.message.editable) {
      await interaction.message.edit({
        embeds: [createGiveawayEmbed(updatedGiveaway, true)],
        components: [createGiveawayActionRow(updatedGiveaway, true)]
      });
      
      // Send a message announcing the reroll
      if (newWinners.length > 0) {
        const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');
        await channel.send({
          content: `**REROLL!** 🎉 Congratulations ${winnerMentions}! You won **${updatedGiveaway.prize}**!`,
          allowedMentions: { users: newWinners }
        });
      } else {
        await channel.send(`**REROLL!** No winners could be determined for the giveaway **${updatedGiveaway.prize}**.`);
      }
      
      await interaction.editReply({
        content: `✅ Successfully rerolled the giveaway! ${newWinners.length > 0 ? 
          `New winners: ${newWinners.map(id => `<@${id}>`).join(', ')}` : 
          'No winners were selected.'}`
      });
    } else {
      await interaction.editReply({
        content: '❌ Could not update the giveaway message.'
      });
    }
  } catch (error) {
    logger.error('Error handling giveaway reroll button:', error);
    await interaction.editReply({
      content: `❌ An error occurred: ${error}`
    });
  }
}

// Export the command and handlers using module.exports
module.exports = {
  ...command,
  handleGiveawayCreateModal,
  handleGiveawayEnterButton,
  handleGiveawayRerollButton,
  createGiveawayEmbed,
  createGiveawayActionRow
}; 