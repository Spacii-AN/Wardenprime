import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows a list of available commands')
    .addStringOption(option => 
      option.setName('command')
        .setDescription('Get information about a specific command')
        .setRequired(false)) as SlashCommandBuilder,
  
  async execute(interaction: ChatInputCommandInteraction) {
    const commandName = interaction.options.getString('command')?.toLowerCase();
    const { commands } = interaction.client;
    
    // If looking for a specific command
    if (commandName) {
      const command = commands.get(commandName);
      
      if (!command) {
        const errorEmbed = createEmbed({
          type: 'error',
          title: 'Command Not Found',
          description: `❌ I couldn't find a command called \`${commandName}\``,
          timestamp: true
        });
        
        await interaction.reply({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Get command options
      const options = command.data.options && command.data.options.length > 0
        ? command.data.options
            .map(option => `\`${option.toJSON().name}\`: ${option.toJSON().description}`)
            .join('\n')
        : 'No options available';
      
      const commandEmbed = createEmbed({
        type: 'info',
        title: `Command: /${command.data.name}`,
        description: command.data.description,
        fields: [
          { name: 'Options', value: options }
        ],
        timestamp: true
      });
      
      await interaction.reply({ embeds: [commandEmbed], flags: MessageFlags.Ephemeral });
      return;
    }
    
    // Group commands by category
    const categories = new Map<string, Command[]>();
    
    commands.forEach(cmd => {
      // Category is determined by directory name
      const categoryName = cmd.data.name === 'help' || cmd.data.name === 'ping' 
        ? 'Utility' 
        : 'Miscellaneous';
      
      if (!categories.has(categoryName)) {
        categories.set(categoryName, []);
      }
      
      categories.get(categoryName)?.push(cmd);
    });
    
    // Create fields for each category
    const fields = Array.from(categories.entries()).map(([category, cmds]) => ({
      name: `📂 ${category}`,
      value: cmds.map(cmd => `\`/${cmd.data.name}\`: ${cmd.data.description}`).join('\n')
    }));
    
    // Create help embed
    const helpEmbed = createEmbed({
      type: 'primary',
      title: 'Command Help',
      description: 'Here are all the available commands:',
      fields: fields,
      footer: 'Use /help <command> for more information about a specific command',
      timestamp: true
    });
    
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  }
};

export = command; 