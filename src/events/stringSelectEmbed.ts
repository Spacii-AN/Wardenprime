import { Events, Interaction, StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Event } from '../types/discord';
import { logger } from '../utils/logger';
import { createEmbed } from '../utils/embedBuilder';
import { pgdb, CustomEmbed, CustomEmbedField } from '../services/postgresDatabase';

// Event fired when a select menu is interacted with
export const name = Events.InteractionCreate;

export const execute: Event<typeof Events.InteractionCreate>['execute'] = async (interaction: Interaction) => {
  // Only process select menu interactions related to embed fields
  if (!interaction.isStringSelectMenu() || 
      !(interaction.customId.startsWith('embed_field_edit_select_') || 
        interaction.customId.startsWith('embed_field_remove_select_'))) {
    return;
  }
  
  const menuInteraction = interaction as StringSelectMenuInteraction;
  const parts = menuInteraction.customId.split('_');
  const action = parts[2]; // edit or remove
  const embedId = parts[4]; // embed ID
  const selectedFieldId = menuInteraction.values[0]; // selected field ID
  
  try {
    logger.debug(`Processing embed field select menu: ${menuInteraction.customId}`);
    
    if (!pgdb) {
      await menuInteraction.reply({
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
    
    // Get the field
    const fields = await pgdb.query<CustomEmbedField>(
      `SELECT * FROM custom_embed_fields WHERE id = $1 AND embed_id = $2`,
      [selectedFieldId, embedId]
    );
    
    if (!fields || fields.length === 0) {
      await menuInteraction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Field Not Found',
          description: 'The selected field could not be found.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    const field = fields[0];
    
    // Get the embed to check permissions
    const embeds = await pgdb.query<CustomEmbed>(
      `SELECT * FROM custom_embeds WHERE id = $1 AND guild_id = $2`,
      [embedId, menuInteraction.guildId]
    );
    
    if (!embeds || embeds.length === 0) {
      await menuInteraction.reply({
        embeds: [createEmbed({
          type: 'error',
          title: 'Embed Not Found',
          description: 'The embed could not be found or you do not have permission to modify it.',
          timestamp: true
        })],
        ephemeral: true
      });
      return;
    }
    
    const embed = embeds[0];
    
    // Handle based on action
    if (action === 'edit') {
      // Create a modal for editing the field
      const modal = new ModalBuilder()
        .setCustomId(`embed_field_edit_${embedId}_${field.id}`)
        .setTitle(`Edit Field: ${field.name}`);
      
      // Field name input
      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Field Name (required)')
        .setStyle(TextInputStyle.Short)
        .setValue(field.name)
        .setPlaceholder('Enter a name for this field')
        .setRequired(true)
        .setMaxLength(256);
      
      // Field value input
      const valueInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Field Value (required)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(field.value)
        .setPlaceholder('Enter the content for this field')
        .setRequired(true)
        .setMaxLength(1024);
      
      // Inline option
      const inlineInput = new TextInputBuilder()
        .setCustomId('inline')
        .setLabel('Inline (true/false)')
        .setStyle(TextInputStyle.Short)
        .setValue(field.inline ? 'true' : 'false')
        .setPlaceholder('true or false')
        .setRequired(true)
        .setMaxLength(5);
      
      const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
      const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput);
      const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(inlineInput);
      
      modal.addComponents(firstRow, secondRow, thirdRow);
      
      await menuInteraction.showModal(modal);
    } 
    else if (action === 'remove') {
      // Handle field removal
      await menuInteraction.deferUpdate();
      
      try {
        // Remove the field
        await pgdb.query(
          `DELETE FROM custom_embed_fields WHERE id = $1 AND embed_id = $2`,
          [field.id, embedId]
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
        
        // Add remaining fields to the preview
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
        
        // Reindex the field positions
        if (updatedEmbed.fields && updatedEmbed.fields.length > 0) {
          const sortedFields = [...updatedEmbed.fields].sort((a, b) => a.position - b.position);
          
          for (let i = 0; i < sortedFields.length; i++) {
            await pgdb.query(
              `UPDATE custom_embed_fields SET position = $1 WHERE id = $2`,
              [i, sortedFields[i].id]
            );
          }
        }
        
        // Send a success message
        await menuInteraction.editReply({
          embeds: [
            createEmbed({
              type: 'success',
              title: 'Field Removed',
              description: `Removed field "${field.name}" from embed **${updatedEmbed.name}**.`,
              timestamp: true
            }),
            previewEmbed
          ],
          components: []
        });
        
        logger.info(`Removed field ${field.id} from embed ${updatedEmbed.name} (${embedId}) by ${menuInteraction.user.tag} (${menuInteraction.user.id}) in guild ${menuInteraction.guildId}`);
      } catch (error) {
        logger.error(`Error removing embed field: ${error instanceof Error ? error.message : String(error)}`);
        
        await menuInteraction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: `Failed to remove field: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: true
          })],
          components: []
        });
      }
    }
  } catch (error) {
    logger.error(`Error handling embed field select menu: ${error instanceof Error ? error.message : String(error)}`);
    
    try {
      if (!menuInteraction.replied) {
        await menuInteraction.reply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: true
          })],
          ephemeral: true
        });
      } else {
        await menuInteraction.editReply({
          embeds: [createEmbed({
            type: 'error',
            title: 'Error',
            description: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: true
          })],
          components: []
        });
      }
    } catch (replyError) {
      logger.error('Failed to send error message for select menu interaction:', replyError);
    }
  }
}; 