import { Events, Interaction, ModalSubmitInteraction } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { createEmbed } from '../utils/embedBuilder';
import { pgdb } from '../services/postgresDatabase';

// Event fired when a modal is submitted
export const name = Events.InteractionCreate;

export const execute: Event<typeof Events.InteractionCreate>['execute'] = async (interaction: Interaction) => {
  // Only process modal submit interactions related to embeds
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('embed_')) {
    return;
  }
  
  const modalInteraction = interaction as ModalSubmitInteraction;
  const parts = modalInteraction.customId.split('_');
  const action = parts[1]; // create, edit, field_add, field_edit
  
  try {
    logger.debug(`Processing embed modal: ${modalInteraction.customId}`);
    
    if (!pgdb) {
      await modalInteraction.reply({
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
    
    switch (action) {
      case 'create':
        await handleCreateEmbedModal(modalInteraction, parts[2]); // parts[2] is the embed name
        break;
      case 'edit':
        await handleEditEmbedModal(modalInteraction, parts[2]); // parts[2] is the embed ID
        break;
      case 'field':
        // For field actions
        if (parts[2] === 'add') {
          await handleAddFieldModal(modalInteraction, parts[3]); // parts[3] is the embed ID
        } else if (parts[2] === 'edit') {
          await handleEditFieldModal(modalInteraction, parts[3], parts[4]); // parts[3] is embed ID, parts[4] is field ID
        }
        break;
      default:
        await modalInteraction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Unknown Action',
            description: 'Unknown modal submission action.',
            timestamp: true
          })],
          ephemeral: true
        });
    }
  } catch (error) {
    logger.error(`Error handling embed modal: ${error instanceof Error ? error.message : String(error)}`);
    
    try {
      await modalInteraction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: true
        })],
        ephemeral: true
      });
    } catch (replyError) {
      logger.error('Failed to send error message for modal submission:', replyError);
    }
  }
};

/**
 * Handles the modal submission for creating a new embed
 */
async function handleCreateEmbedModal(interaction: ModalSubmitInteraction, embedName: string) {
  // Get values from the modal
  const title = interaction.fields.getTextInputValue('title');
  const description = interaction.fields.getTextInputValue('description');
  const color = interaction.fields.getTextInputValue('color');
  const footer = interaction.fields.getTextInputValue('footer');
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Create the embed in the database - if embedName is 'unnamed', pass null to use auto-generation
    const finalName = embedName === 'unnamed' ? null : embedName;
    
    const embed = await pgdb.createCustomEmbed(
      interaction.guildId!,
      interaction.user.id,
      finalName,
      {
        title: title || null,
        description: description || null,
        color: color || '#5865F2',
        footer: footer || null,
        timestamp: false
      }
    );
    
    // Create a preview of the embed
    const previewEmbed = createEmbed({
      title: embed.title || undefined,
      description: embed.description || undefined,
      color: embed.color as any,
      footer: embed.footer || undefined,
      timestamp: embed.timestamp
    });
    
    // Send a success message
    const displayName = embed.name || "Unnamed Embed";
    
    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'success',
          title: 'Embed Created',
          description: `The embed **${displayName}** has been created successfully.\n\n**This is just a preview.** To send this embed to a channel, use \`/embed send name:${displayName} channel:#channel\`.`,
          timestamp: true
        }),
        previewEmbed
      ]
    });
    
    logger.info(`Created embed ${displayName} by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);
  } catch (error) {
    logger.error(`Error creating embed: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `Failed to create embed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the modal submission for editing an existing embed
 */
async function handleEditEmbedModal(interaction: ModalSubmitInteraction, embedId: string) {
  // Get values from the modal
  const title = interaction.fields.getTextInputValue('title');
  const description = interaction.fields.getTextInputValue('description');
  const color = interaction.fields.getTextInputValue('color');
  const footer = interaction.fields.getTextInputValue('footer');
  
  // Parse additional options
  let options: Record<string, any> = {};
  try {
    const optionsText = interaction.fields.getTextInputValue('options');
    if (optionsText) {
      options = JSON.parse(optionsText);
    }
  } catch (error) {
    // If JSON parsing fails, we'll just log it and continue with empty options
    logger.warn(`Invalid JSON in options field: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get the original embed
    const originalEmbed = await pgdb.query(
      `SELECT * FROM custom_embeds WHERE id = $1 AND guild_id = $2`,
      [embedId, interaction.guildId]
    );
    
    if (!originalEmbed || originalEmbed.length === 0) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Embed not found or you do not have permission to edit it.',
          timestamp: true
        })]
      });
      return;
    }
    
    // Update the embed in the database
    await pgdb.query(
      `UPDATE custom_embeds 
      SET title = $1, description = $2, color = $3, footer = $4, 
          timestamp = $5, thumbnail = $6, image = $7, 
          author_name = $8, author_icon_url = $9, author_url = $10, 
          updated_at = NOW() 
      WHERE id = $11 AND guild_id = $12`,
      [
        title || null,
        description || null,
        color || '#5865F2',
        footer || null,
        options.timestamp || false,
        options.thumbnail || null,
        options.image || null,
        options.author_name || null,
        options.author_icon_url || null,
        options.author_url || null,
        embedId,
        interaction.guildId
      ]
    );
    
    // Get the updated embed
    const updatedEmbed = await pgdb.getCustomEmbedById(embedId);
    
    if (!updatedEmbed) {
      throw new Error('Failed to retrieve updated embed');
    }
    
    // Create a preview of the updated embed
    const previewEmbed = createEmbed({
      title: updatedEmbed.title || undefined,
      description: updatedEmbed.description || undefined,
      color: updatedEmbed.color as any,
      footer: updatedEmbed.footer || undefined,
      timestamp: updatedEmbed.timestamp
    });
    
    // If there are fields, add them to the preview
    if (updatedEmbed.fields && updatedEmbed.fields.length > 0) {
      const sortedFields = [...updatedEmbed.fields].sort((a, b) => a.position - b.position);
      previewEmbed.addFields(
        sortedFields.map(field => ({
          name: field.name,
          value: field.value,
          inline: field.inline
        }))
      );
    }
    
    // Send a success message
    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'success',
          title: 'Embed Updated',
          description: `The embed **${updatedEmbed.name}** has been updated successfully.`,
          timestamp: true
        }),
        previewEmbed
      ]
    });
    
    logger.info(`Updated embed ${updatedEmbed.name} (${embedId}) by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);
  } catch (error) {
    logger.error(`Error updating embed: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `Failed to update embed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the modal submission for adding a field to an embed
 */
async function handleAddFieldModal(interaction: ModalSubmitInteraction, embedId: string) {
  // Get values from the modal
  const name = interaction.fields.getTextInputValue('name');
  const value = interaction.fields.getTextInputValue('value');
  const inlineText = interaction.fields.getTextInputValue('inline').toLowerCase();
  const inline = inlineText === 'true';
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get the embed to make sure it exists and belongs to this guild
    const embeds = await pgdb.query(
      `SELECT * FROM custom_embeds WHERE id = $1 AND guild_id = $2`,
      [embedId, interaction.guildId]
    );
    
    if (!embeds || embeds.length === 0) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Embed not found or you do not have permission to edit it.',
          timestamp: true
        })]
      });
      return;
    }
    
    const embed = embeds[0];
    
    // Get current field count
    const fields = await pgdb.getCustomEmbedFields(embedId);
    const position = fields.length;
    
    // Add the field
    await pgdb.addCustomEmbedField(
      embedId,
      name,
      value,
      inline,
      position
    );
    
    // Get the updated embed with fields
    const updatedEmbed = await pgdb.getCustomEmbedById(embedId);
    
    if (!updatedEmbed) {
      throw new Error('Failed to retrieve updated embed');
    }
    
    // Create a preview of the updated embed
    const previewEmbed = createEmbed({
      title: updatedEmbed.title || undefined,
      description: updatedEmbed.description || undefined,
      color: updatedEmbed.color as any,
      footer: updatedEmbed.footer || undefined,
      timestamp: updatedEmbed.timestamp
    });
    
    // Add fields to the preview
    if (updatedEmbed.fields && updatedEmbed.fields.length > 0) {
      const sortedFields = [...updatedEmbed.fields].sort((a, b) => a.position - b.position);
      previewEmbed.addFields(
        sortedFields.map(field => ({
          name: field.name,
          value: field.value,
          inline: field.inline
        }))
      );
    }
    
    // Send a success message
    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'success',
          title: 'Field Added',
          description: `Added field to embed **${updatedEmbed.name}**.`,
          timestamp: true
        }),
        previewEmbed
      ]
    });
    
    logger.info(`Added field to embed ${updatedEmbed.name} (${embedId}) by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);
  } catch (error) {
    logger.error(`Error adding embed field: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `Failed to add field: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
}

/**
 * Handles the modal submission for editing a field in an embed
 */
async function handleEditFieldModal(interaction: ModalSubmitInteraction, embedId: string, fieldId: string) {
  // Get values from the modal
  const name = interaction.fields.getTextInputValue('name');
  const value = interaction.fields.getTextInputValue('value');
  const inlineText = interaction.fields.getTextInputValue('inline').toLowerCase();
  const inline = inlineText === 'true';
  
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get the embed to make sure it exists and belongs to this guild
    const embeds = await pgdb.query(
      `SELECT * FROM custom_embeds WHERE id = $1 AND guild_id = $2`,
      [embedId, interaction.guildId]
    );
    
    if (!embeds || embeds.length === 0) {
      await interaction.editReply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Error',
          description: 'Embed not found or you do not have permission to edit it.',
          timestamp: true
        })]
      });
      return;
    }
    
    const embed = embeds[0];
    
    // Update the field
    await pgdb.query(
      `UPDATE custom_embed_fields 
      SET name = $1, value = $2, inline = $3 
      WHERE id = $4 AND embed_id = $5`,
      [name, value, inline, fieldId, embedId]
    );
    
    // Get the updated embed with fields
    const updatedEmbed = await pgdb.getCustomEmbedById(embedId);
    
    if (!updatedEmbed) {
      throw new Error('Failed to retrieve updated embed');
    }
    
    // Create a preview of the updated embed
    const previewEmbed = createEmbed({
      title: updatedEmbed.title || undefined,
      description: updatedEmbed.description || undefined,
      color: updatedEmbed.color as any,
      footer: updatedEmbed.footer || undefined,
      timestamp: updatedEmbed.timestamp
    });
    
    // Add fields to the preview
    if (updatedEmbed.fields && updatedEmbed.fields.length > 0) {
      const sortedFields = [...updatedEmbed.fields].sort((a, b) => a.position - b.position);
      previewEmbed.addFields(
        sortedFields.map(field => ({
          name: field.name,
          value: field.value,
          inline: field.inline
        }))
      );
    }
    
    // Send a success message
    await interaction.editReply({
      embeds: [
        createEmbed({
          type: 'success',
          title: 'Field Updated',
          description: `Updated field in embed **${updatedEmbed.name}**.`,
          timestamp: true
        }),
        previewEmbed
      ]
    });
    
    logger.info(`Updated field in embed ${updatedEmbed.name} (${embedId}) by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);
  } catch (error) {
    logger.error(`Error updating embed field: ${error instanceof Error ? error.message : String(error)}`);
    
    await interaction.editReply({
      embeds: [createEmbed({
        type: 'error',
        title: 'Error',
        description: `Failed to update field: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: true
      })]
    });
  }
} 