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
  StringSelectMenuInteraction,
  TextChannel,
  ColorResolvable,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import { Command } from '../../types/discord';
import { pgdb, CustomEmbed, CustomEmbedField, CustomEmbedWithFields } from '../../services/postgresDatabase';
import { createEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

/**
 * Embed builder command for creating and managing custom embeds
 * 
 * Features:
 * - Create new embeds with customizable properties
 * - Add/edit/remove fields to embeds
 * - Send embeds to channels
 * - List, view, edit and delete existing embeds
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and manage custom embeds')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new custom embed')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name for the embed (used to reference it later)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all custom embeds in this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View a specific custom embed')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the embed to view')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit a custom embed')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the embed to edit')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a custom embed')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the embed to delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('field')
        .setDescription('Add, edit, or remove a field from an embed')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to perform on the field')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Edit', value: 'edit' },
              { name: 'Remove', value: 'remove' }
            )
        )
        .addStringOption(option =>
          option
            .setName('embed_name')
            .setDescription('Name of the embed to modify')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('send')
        .setDescription('Send a custom embed to a channel')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the embed to send')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to send the embed to')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) as SlashCommandBuilder,

  cooldown: 3,

  async execute(interaction: ChatInputCommandInteraction) {
    // Log command start
    logger.debug(`Embed command initiated by ${interaction.user.tag} (${interaction.user.id})`);

    // Make sure the command is used in a guild
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

    // Ensure database is available
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

    // Handle different subcommands
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'create':
        await handleCreateCommand(interaction);
        break;
      case 'list':
        await handleListCommand(interaction);
        break;
      case 'view':
        await handleViewCommand(interaction);
        break;
      case 'edit':
        await handleEditCommand(interaction);
        break;
      case 'delete':
        await handleDeleteCommand(interaction);
        break;
      case 'field':
        await handleFieldCommand(interaction);
        break;
      case 'send':
        await handleSendCommand(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: 'Unknown subcommand.',
            timestamp: true
          })],
          ephemeral: true
        });
    }
  }
};

/**
 * Handles the 'create' subcommand to create a new custom embed
 */
async function handleCreateCommand(interaction: ChatInputCommandInteraction) {
  const embedName = interaction.options.getString('name', true);
  
  try {
    const existingEmbed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (existingEmbed) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An embed with the name "${embedName}" already exists in this server.`,
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    // Create the modal for embed creation
    const modal = new ModalBuilder()
      .setCustomId(`embed_create_${embedName}`)
      .setTitle('Create Custom Embed');
    
    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a title for your embed')
      .setRequired(false)
      .setMaxLength(256);
    
    // Description input
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter a description for your embed')
      .setRequired(false)
      .setMaxLength(4000);
    
    // Color input
    const colorInput = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('Color (hex format, optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('#5865F2 (Discord Blurple)')
      .setValue('#5865F2')
      .setRequired(false)
      .setMaxLength(7);
    
    // Footer input
    const footerInput = new TextInputBuilder()
      .setCustomId('footer')
      .setLabel('Footer (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter footer text')
      .setRequired(false)
      .setMaxLength(2048);
    
    // Add components to the modal
    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);
    const fourthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput);
    
    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Error creating embed: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.reply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })],
      ephemeral: true
    });
  }
}

/**
 * Handles the 'list' subcommand to list all custom embeds in the server
 */
async function handleListCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Query all embeds for this guild
    const guildEmbeds = await pgdb!.query<CustomEmbed>(
      `SELECT * FROM custom_embeds WHERE guild_id = $1 ORDER BY name ASC`,
      [interaction.guildId]
    );
    
    if (!guildEmbeds || guildEmbeds.length === 0) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'info',
          title: 'No Custom Embeds',
          description: 'This server has no custom embeds.\n\nUse `/embed create` to create one.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Create embed list with pagination if needed
    const totalEmbeds = guildEmbeds.length;
    const embedsPerPage = 10;
    const totalPages = Math.ceil(totalEmbeds / embedsPerPage);
    let currentPage = 1;
    
    // Function to generate the embeds list for a specific page
    const generateEmbedsListEmbed = (page: number) => {
      const startIndex = (page - 1) * embedsPerPage;
      const endIndex = Math.min(startIndex + embedsPerPage, totalEmbeds);
      const embedsOnPage = guildEmbeds.slice(startIndex, endIndex);
      
      const embedsList = embedsOnPage.map((embed, index) => {
        const number = startIndex + index + 1;
        const creator = interaction.guild!.members.cache.get(embed.creator_id)?.user.tag || 'Unknown User';
        return `${number}. **${embed.name}**\n   • Created by: ${creator}\n   • Title: ${embed.title || 'None'}\n`;
      }).join('\n');
      
      return createEmbed({
        type: 'primary',
        title: 'Custom Embeds',
        description: embedsList,
        footer: `Page ${page}/${totalPages} • Total embeds: ${totalEmbeds}`,
        timestamp: true
      });
    };
    
    // Generate the initial embeds page
    const initialEmbed = generateEmbedsListEmbed(currentPage);
    
    // Create navigation buttons if there are multiple pages
    let components: ActionRowBuilder<ButtonBuilder>[] = [];
    
    if (totalPages > 1) {
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('embed_list_prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
          new ButtonBuilder()
            .setCustomId('embed_list_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages)
        );
      
      components.push(row);
    }
    
    // Add action buttons for viewing and managing embeds
    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('embed_list_view')
          .setLabel('View')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('embed_list_edit')
          .setLabel('Edit')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('embed_list_delete')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('embed_list_send')
          .setLabel('Send')
          .setStyle(ButtonStyle.Success)
      );
    
    components.push(actionRow);
    
    const response = await interaction.editReply({
      embeds: [initialEmbed],
      components
    });
    
    // Set up collector for button interactions
    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300000 // 5 minutes
    });
    
    collector.on('collect', async i => {
      // Handle pagination
      if (i.customId === 'embed_list_next' && currentPage < totalPages) {
        currentPage++;
        const newEmbed = generateEmbedsListEmbed(currentPage);
        
        // Update pagination buttons
        components[0].components[0].setDisabled(currentPage === 1);
        components[0].components[1].setDisabled(currentPage === totalPages);
        
        await i.update({ embeds: [newEmbed], components });
      } 
      else if (i.customId === 'embed_list_prev' && currentPage > 1) {
        currentPage--;
        const newEmbed = generateEmbedsListEmbed(currentPage);
        
        // Update pagination buttons
        components[0].components[0].setDisabled(currentPage === 1);
        components[0].components[1].setDisabled(currentPage === totalPages);
        
        await i.update({ embeds: [newEmbed], components });
      }
      // Handle action buttons (view, edit, delete, send)
      else if (i.customId.startsWith('embed_list_')) {
        const action = i.customId.split('_')[2];
        
        // Create a select menu with available embeds
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`embed_select_${action}`)
          .setPlaceholder('Select an embed')
          .setMinValues(1)
          .setMaxValues(1);
        
        // Add options for each embed
        guildEmbeds.forEach(embed => {
          selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(embed.name)
              .setDescription(embed.title || 'No title')
              .setValue(embed.name)
          );
        });
        
        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(selectMenu);
        
        await i.update({ 
          embeds: [createEmbed({
            type: 'info',
            title: `Select Embed to ${action.charAt(0).toUpperCase() + action.slice(1)}`,
            description: 'Choose one of your custom embeds from the dropdown below:',
            timestamp: true
          })],
          components: [selectRow]
        });
      }
      // Handle select menu interactions
      else if (i.customId.startsWith('embed_select_') && i.isStringSelectMenu()) {
        const action = i.customId.split('_')[2];
        const selectedEmbedName = i.values[0];
        
        // Close this menu and call the appropriate handler
        await i.deferUpdate();
        
        // Simulate a new interaction with the selected embed
        const fakeInteraction = {
          ...interaction,
          options: {
            ...interaction.options,
            getString: (name: string) => {
              if (name === 'name' || name === 'embed_name') {
                return selectedEmbedName;
              }
              return null;
            }
          }
        } as ChatInputCommandInteraction;
        
        switch (action) {
          case 'view':
            await handleViewCommand(fakeInteraction);
            break;
          case 'edit':
            await handleEditCommand(fakeInteraction);
            break;
          case 'delete':
            await handleDeleteCommand(fakeInteraction);
            break;
          case 'send':
            // For send we need to show a channel selector
            await i.editReply({
              embeds: [createEmbed({
                type: 'info',
                title: 'Send Embed',
                description: `Selected embed: **${selectedEmbedName}**\n\nPlease use \`/embed send name:${selectedEmbedName} channel:#channel\` to send this embed to a channel.`,
                timestamp: true
              })],
              components: []
            });
            break;
        }
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        // Disable all buttons when the collector times out
        components.forEach(row => {
          row.components.forEach(component => {
            component.setDisabled(true);
          });
        });
        
        await interaction.editReply({
          embeds: [createEmbed({
            type: 'info',
            title: 'Custom Embeds',
            description: 'This interaction has expired. Please run the command again to see the embeds.',
            timestamp: true
          })],
          components: []
        }).catch(() => {}); // Ignore errors if the message was deleted
      }
    });
  } catch (error) {
    logger.error(`Error listing embeds: ${error instanceof Error ? error.message : String(error)}`);
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
 * Handles the 'view' subcommand to view a specific custom embed
 */
async function handleViewCommand(interaction: ChatInputCommandInteraction) {
  const embedName = interaction.options.getString('name', true);
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get the embed from the database
    const embed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (!embed) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `No embed found with the name "${embedName}" in this server.`,
          timestamp: true
        })]
      });
      return;
    }
    
    // Create an EmbedBuilder to preview the embed
    const previewEmbed = new EmbedBuilder()
      .setTitle(embed.title || null)
      .setDescription(embed.description || null)
      .setColor(embed.color as ColorResolvable);
    
    if (embed.thumbnail) previewEmbed.setThumbnail(embed.thumbnail);
    if (embed.image) previewEmbed.setImage(embed.image);
    if (embed.footer) previewEmbed.setFooter({ text: embed.footer });
    if (embed.timestamp) previewEmbed.setTimestamp();
    
    // Add author if set
    if (embed.author_name) {
      previewEmbed.setAuthor({
        name: embed.author_name,
        iconURL: embed.author_icon_url || undefined,
        url: embed.author_url || undefined
      });
    }
    
    // Add fields if present
    if (embed.fields && embed.fields.length > 0) {
      // Sort fields by position
      const sortedFields = [...embed.fields].sort((a, b) => a.position - b.position);
      
      sortedFields.forEach(field => {
        previewEmbed.addFields({
          name: field.name,
          value: field.value,
          inline: field.inline
        });
      });
    }
    
    // Create information embed
    const infoEmbed = createEmbed({
      type: 'info',
      title: `Embed: ${embed.name}`,
      description: 'Below is a preview of your custom embed.\n\n**Note:** This is just a preview, not visible to other users. To send this embed to a channel, use the Send button below or the `/embed send` command.',
      fields: [
        { name: 'Created by', value: `<@${embed.creator_id}>`, inline: true },
        { name: 'Created at', value: new Date(embed.created_at).toLocaleString(), inline: true },
        { name: 'Last updated', value: new Date(embed.updated_at).toLocaleString(), inline: true },
        { name: 'Fields', value: embed.fields?.length.toString() || '0', inline: true },
        { name: 'Color', value: embed.color || '#5865F2', inline: true }
      ],
      timestamp: true
    });
    
    // Create buttons for actions
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`embed_view_edit_${embed.name}`)
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`embed_view_send_${embed.name}`)
          .setLabel('Send')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`embed_view_delete_${embed.name}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger)
      );
    
    const response = await interaction.editReply({
      embeds: [infoEmbed, previewEmbed],
      components: [row]
    });
    
    // Set up collector for button interactions
    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300000 // 5 minutes
    });
    
    collector.on('collect', async i => {
      if (i.customId.startsWith('embed_view_')) {
        const parts = i.customId.split('_');
        const action = parts[2];
        const selectedEmbedName = parts.slice(3).join('_');
        
        // Simulate a new interaction with the selected embed
        const fakeInteraction = {
          ...interaction,
          options: {
            ...interaction.options,
            getString: (name: string) => {
              if (name === 'name' || name === 'embed_name') {
                return selectedEmbedName;
              }
              return null;
            }
          }
        } as ChatInputCommandInteraction;
        
        // Close this interaction and call the appropriate handler
        await i.deferUpdate();
        
        switch (action) {
          case 'edit':
            await handleEditCommand(fakeInteraction);
            break;
          case 'send':
            // For send we need to show a channel selector
            await i.editReply({
              embeds: [createEmbed({
                type: 'info',
                title: 'Send Embed',
                description: `Please use \`/embed send name:${selectedEmbedName} channel:#channel\` to send this embed to a channel.`,
                timestamp: true
              })],
              components: []
            });
            break;
          case 'delete':
            await handleDeleteCommand(fakeInteraction);
            break;
        }
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        // Disable all buttons when the collector times out
        row.components.forEach(component => {
          component.setDisabled(true);
        });
        
        await interaction.editReply({
          components: [row]
        }).catch(() => {}); // Ignore errors if the message was deleted
      }
    });
  } catch (error) {
    logger.error(`Error viewing embed: ${error instanceof Error ? error.message : String(error)}`);
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
 * Handles the 'edit' subcommand to edit an existing custom embed
 */
async function handleEditCommand(interaction: ChatInputCommandInteraction) {
  const embedName = interaction.options.getString('name', true);
  
  try {
    // Get the embed from the database
    const embed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (!embed) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `No embed found with the name "${embedName}" in this server.`,
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    // Create the modal for embed editing
    const modal = new ModalBuilder()
      .setCustomId(`embed_edit_${embed.id}`)
      .setTitle(`Edit Embed: ${embedName}`);
    
    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue(embed.title || '')
      .setPlaceholder('Enter a title for your embed')
      .setRequired(false)
      .setMaxLength(256);
    
    // Description input
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(embed.description || '')
      .setPlaceholder('Enter a description for your embed')
      .setRequired(false)
      .setMaxLength(4000);
    
    // Color input
    const colorInput = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('Color (hex format, optional)')
      .setStyle(TextInputStyle.Short)
      .setValue(embed.color || '#5865F2')
      .setPlaceholder('#5865F2 (Discord Blurple)')
      .setRequired(false)
      .setMaxLength(7);
    
    // Footer input
    const footerInput = new TextInputBuilder()
      .setCustomId('footer')
      .setLabel('Footer (optional)')
      .setStyle(TextInputStyle.Short)
      .setValue(embed.footer || '')
      .setPlaceholder('Enter footer text')
      .setRequired(false)
      .setMaxLength(2048);
    
    // Options input
    const optionsInput = new TextInputBuilder()
      .setCustomId('options')
      .setLabel('Additional Options (JSON format, optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(JSON.stringify({
        timestamp: embed.timestamp || false,
        thumbnail: embed.thumbnail || '',
        image: embed.image || '',
        author_name: embed.author_name || '',
        author_icon_url: embed.author_icon_url || '',
        author_url: embed.author_url || ''
      }, null, 2))
      .setPlaceholder('{"timestamp": true, "thumbnail": "url", "image": "url", "author_name": "name"}')
      .setRequired(false);
    
    // Add components to the modal
    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);
    const fourthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput);
    const fifthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(optionsInput);
    
    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Error editing embed: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.reply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })],
      ephemeral: true
    });
  }
}

/**
 * Handles the 'delete' subcommand to delete a custom embed
 */
async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  const embedName = interaction.options.getString('name', true);
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get the embed from the database
    const embed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (!embed) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `No embed found with the name "${embedName}" in this server.`,
          timestamp: true
        })]
      });
      return;
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`embed_delete_confirm_${embed.id}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('embed_delete_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Send confirmation message
    const response = await interaction.editReply({
      embeds: [createEmbed({
        type: 'warning',
        title: 'Confirm Deletion',
        description: `Are you sure you want to delete the embed **${embedName}**? This action cannot be undone.`,
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
      if (i.customId === `embed_delete_confirm_${embed.id}`) {
        await i.deferUpdate();
        
        try {
          // Delete the embed
          await pgdb!.query(
            'DELETE FROM custom_embeds WHERE id = $1 AND guild_id = $2',
            [embed.id, interaction.guildId]
          );
          
          await i.editReply({
            embeds: [createEmbed({
              type: 'success',
              title: 'Embed Deleted',
              description: `The embed **${embedName}** has been deleted.`,
              timestamp: true
            })],
            components: []
          });
          
          logger.info(`Embed ${embedName} (${embed.id}) deleted by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);
        } catch (error) {
          logger.error(`Error deleting embed: ${error instanceof Error ? error.message : String(error)}`);
          
          await i.editReply({
            embeds: [createEmbed({
              type: 'error',
              title: 'Error',
              description: `Failed to delete embed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: true
            })],
            components: []
          });
        }
      } else if (i.customId === 'embed_delete_cancel') {
        await i.update({
          embeds: [createEmbed({
            type: 'info',
            title: 'Deletion Cancelled',
            description: `The embed **${embedName}** was not deleted.`,
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
            description: 'Timed out. The embed was not deleted.',
            timestamp: true
          })],
          components: [row]
        }).catch(() => {}); // Ignore errors if the message was deleted
      }
    });
  } catch (error) {
    logger.error(`Error handling delete embed: ${error instanceof Error ? error.message : String(error)}`);
    
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
 * Handles the 'field' subcommand to add, edit, or remove fields from an embed
 */
async function handleFieldCommand(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString('action', true);
  const embedName = interaction.options.getString('embed_name', true);
  
  try {
    // Get the embed from the database
    const embed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (!embed) {
      await interaction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `No embed found with the name "${embedName}" in this server.`,
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    // Handle different field actions
    switch (action) {
      case 'add':
        // Create modal for adding a field
        const addModal = new ModalBuilder()
          .setCustomId(`embed_field_add_${embed.id}`)
          .setTitle(`Add Field to ${embedName}`);
        
        // Field name input
        const nameInput = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Field Name (required)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter a name for this field')
          .setRequired(true)
          .setMaxLength(256);
        
        // Field value input
        const valueInput = new TextInputBuilder()
          .setCustomId('value')
          .setLabel('Field Value (required)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter the content for this field')
          .setRequired(true)
          .setMaxLength(1024);
        
        // Inline option
        const inlineInput = new TextInputBuilder()
          .setCustomId('inline')
          .setLabel('Inline (true/false)')
          .setStyle(TextInputStyle.Short)
          .setValue('true')
          .setPlaceholder('true or false')
          .setRequired(true)
          .setMaxLength(5);
        
        const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput);
        const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(inlineInput);
        
        addModal.addComponents(firstRow, secondRow, thirdRow);
        
        await interaction.showModal(addModal);
        break;
        
      case 'edit':
        // Get existing fields
        if (!embed.fields || embed.fields.length === 0) {
          await interaction.reply({
            embeds: [createEmbed({
              type: 'error',
              title: 'No Fields',
              description: `The embed "${embedName}" doesn't have any fields to edit.`,
              timestamp: true
            })],
            ephemeral: true
          });
          return;
        }
        
        // Create a select menu with the fields
        const selectField = new StringSelectMenuBuilder()
          .setCustomId(`embed_field_edit_select_${embed.id}`)
          .setPlaceholder('Select a field to edit')
          .setMinValues(1)
          .setMaxValues(1);
        
        // Sort fields by position
        const sortedFields = [...embed.fields].sort((a, b) => a.position - b.position);
        
        // Add options for each field
        sortedFields.forEach((field, index) => {
          selectField.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(`Field ${index + 1}: ${field.name.substring(0, 20)}${field.name.length > 20 ? '...' : ''}`)
              .setDescription(`${field.value.substring(0, 50)}${field.value.length > 50 ? '...' : ''}`)
              .setValue(field.id)
          );
        });
        
        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(selectField);
        
        await interaction.reply({
          embeds: [createEmbed({
            type: 'info',
            title: 'Edit Field',
            description: `Select a field from the embed "${embedName}" to edit:`,
            timestamp: true
          })],
          components: [selectRow],
          ephemeral: true
        });
        break;
        
      case 'remove':
        // Get existing fields
        if (!embed.fields || embed.fields.length === 0) {
          await interaction.reply({
            embeds: [createEmbed({
              type: 'error',
              title: 'No Fields',
              description: `The embed "${embedName}" doesn't have any fields to remove.`,
              timestamp: true
            })],
            ephemeral: true
          });
          return;
        }
        
        // Create a select menu with the fields
        const removeField = new StringSelectMenuBuilder()
          .setCustomId(`embed_field_remove_select_${embed.id}`)
          .setPlaceholder('Select a field to remove')
          .setMinValues(1)
          .setMaxValues(1);
        
        // Sort fields by position
        const fieldsToRemove = [...embed.fields].sort((a, b) => a.position - b.position);
        
        // Add options for each field
        fieldsToRemove.forEach((field, index) => {
          removeField.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(`Field ${index + 1}: ${field.name.substring(0, 20)}${field.name.length > 20 ? '...' : ''}`)
              .setDescription(`${field.value.substring(0, 50)}${field.value.length > 50 ? '...' : ''}`)
              .setValue(field.id)
          );
        });
        
        const removeRow = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(removeField);
        
        await interaction.reply({
          embeds: [createEmbed({
            type: 'info',
            title: 'Remove Field',
            description: `Select a field from the embed "${embedName}" to remove:`,
            timestamp: true
          })],
          components: [removeRow],
          ephemeral: true
        });
        break;
        
      default:
        await interaction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Invalid Action',
            description: 'Please specify a valid action: add, edit, or remove.',
            timestamp: true
          })],
          ephemeral: true
        });
    }
  } catch (error) {
    logger.error(`Error handling field command: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.reply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })],
      ephemeral: true
    });
  }
}

/**
 * Handles the 'send' subcommand to send a custom embed to a channel
 */
async function handleSendCommand(interaction: ChatInputCommandInteraction) {
  const embedName = interaction.options.getString('name', true);
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Validate channel type
    if (!channel.isTextBased()) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Invalid Channel',
          description: 'The specified channel is not a text channel.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Check permissions
    const permissions = channel.permissionsFor(interaction.guild!.members.me!);
    
    if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Missing Permissions',
          description: `I don't have permission to send messages or embed links in ${channel}.`,
          timestamp: true
        })]
      });
      return;
    }
    
    // Log channel info for debugging
    logger.debug(`Sending embed to channel: ${channel.id} (${channel.name})`);
    
    // Get the embed from the database
    const embed = await pgdb!.getCustomEmbedByName(interaction.guildId!, embedName);
    
    if (!embed) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `No embed found with the name "${embedName}" in this server.`,
          timestamp: true
        })]
      });
      return;
    }
    
    // Create the Discord embed to send
    const discordEmbed = new EmbedBuilder()
      .setTitle(embed.title || null)
      .setDescription(embed.description || null)
      .setColor(embed.color as ColorResolvable);
    
    if (embed.thumbnail) discordEmbed.setThumbnail(embed.thumbnail);
    if (embed.image) discordEmbed.setImage(embed.image);
    if (embed.footer) discordEmbed.setFooter({ text: embed.footer });
    if (embed.timestamp) discordEmbed.setTimestamp();
    
    // Add author if set
    if (embed.author_name) {
      discordEmbed.setAuthor({
        name: embed.author_name,
        iconURL: embed.author_icon_url || undefined,
        url: embed.author_url || undefined
      });
    }
    
    // Add fields if present
    if (embed.fields && embed.fields.length > 0) {
      // Sort fields by position
      const sortedFields = [...embed.fields].sort((a, b) => a.position - b.position);
      
      sortedFields.forEach(field => {
        discordEmbed.addFields({
          name: field.name,
          value: field.value,
          inline: field.inline
        });
      });
    }
    
    // Send the embed to the channel
    try {
      // Ensure the embed has at least some content
      if (!discordEmbed.data.title && !discordEmbed.data.description && 
          (!embed.fields || embed.fields.length === 0)) {
        // Add a fallback description if embed is empty
        discordEmbed.setDescription("*This embed appears to be empty*");
      }
      
      // Make sure the embed will be visible to everyone (not ephemeral)
      const sentMessage = await channel.send({ embeds: [discordEmbed] });
      
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'success',
          title: 'Embed Sent',
          description: `The embed **${embedName}** has been sent to ${channel} and is visible to everyone in that channel. You can dismiss this confirmation message safely.`,
          fields: [
            { name: 'Message ID', value: sentMessage.id, inline: true },
            { name: 'Channel', value: `<#${channel.id}>`, inline: true }
          ],
          timestamp: true
        })]
      });
      
      logger.info(`Embed ${embedName} (${embed.id}) sent to channel ${channel.id} by ${interaction.user.tag} (${interaction.user.id})`);
    } catch (error) {
      logger.error(`Error sending embed to channel: ${error instanceof Error ? error.message : String(error)}`);
      
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `Failed to send embed to channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })]
      });
    }
  } catch (error) {
    logger.error(`Error handling send command: ${error instanceof Error ? error.message : String(error)}`);
    
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

export = command; 