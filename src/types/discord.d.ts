import { 
  Client, 
  Collection, 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ClientEvents,
  AutocompleteInteraction
} from 'discord.js';

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command>;
  }
}

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldown?: number; // Cooldown in seconds
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>; // Autocomplete handler
}

export interface Event<K extends keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
} 