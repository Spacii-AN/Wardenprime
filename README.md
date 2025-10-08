# Korptair Discord Bot Documentation

This document provides an overview of the available slash commands for the Korptair Discord bot.

# Universal Discord Bot

A scalable, universal Discord bot built with TypeScript and discord.js that exclusively uses embeds for all responses and integrates with PostgreSQL for data persistence.

## Features

- Modular command system with categories
- Event-based architecture
- TypeScript for type safety
- PostgreSQL database integration
- Consistent embed-based responses
- Command cooldown system
- Extensive configuration options
- Environment-based settings

## Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A Discord bot application (create one at the [Discord Developer Portal](https://discord.com/developers/applications))
- PostgreSQL database (optional, can fall back to JSON storage)

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file with your bot's credentials and preferences
5. If using PostgreSQL, ensure your database connection details are correct in the `.env` file

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" tab
4. Click "Add Bot"
5. Under the "Privileged Gateway Intents" section, enable:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
6. Copy your bot token and add it to your `.env` file
7. Navigate to the "OAuth2" tab
8. Select "bot" and "applications.commands" scopes
9. Select the required bot permissions (at minimum, "Send Messages")
10. Use the generated URL to invite the bot to your server

## Development

Start the bot in development mode:

```bash
npm run dev
```

Deploy slash commands to your test guild (faster for development):

```bash
npm run deploy
```

## Production

Build the TypeScript code:

```bash
npm run build
```

Start the production bot:

```bash
npm start
```

## Database Configuration

The bot supports two database types:

### PostgreSQL (Preferred)

For production use, PostgreSQL is recommended. Configure your PostgreSQL connection details in the `.env` file:

```
# Database configuration
DATABASE_TYPE=postgres

# PostgreSQL configuration
PG_HOST=your-postgres-host
PG_PORT=5432
PG_DATABASE=your-database-name
PG_USER=your-database-user
PG_PASSWORD=your-database-password
PG_SSL_MODE=require  # or 'disable' if not using SSL
```

When using PostgreSQL, the bot automatically creates the necessary tables on startup.

### JSON Database (Fallback)

For development or simple use cases, the bot can use a JSON-based file storage system. To use this, set:

```
# Database configuration
DATABASE_TYPE=json
```

## Customization

### Environment Variables

The bot comes with various customization options that can be set in the `.env` file:

```
# Bot customization
BOT_NAME=Discord Bot
BOT_PREFIX=!
BOT_OWNER_ID=optional_owner_user_id

# Embed customization - Use hex color without #
EMBED_COLOR=5865F2
EMBED_FOOTER=Powered by Discord.js

# Feature flags
ENABLE_COOLDOWNS=true
ENABLE_MENTIONS=true
ENABLE_LOGGING=true
```

### Using the Embed Utility

All bot responses use embeds for consistent styling. To create an embed in your commands:

```typescript
import { createEmbed } from '../../utils/embedBuilder';

// Create a basic info embed
const embed = createEmbed({
  type: 'info',
  title: 'My Title',
  description: 'My description',
  timestamp: true
});

// Create a success embed with fields
const successEmbed = createEmbed({
  type: 'success',
  title: 'Success!',
  description: 'The operation was successful',
  fields: [
    { name: 'Field 1', value: 'Value 1', inline: true },
    { name: 'Field 2', value: 'Value 2', inline: true }
  ],
  footer: 'My custom footer',
  timestamp: true
});

// Send the embed
await interaction.reply({ embeds: [embed] });
```

### Adding Commands

1. Create a new TypeScript file in a category folder under `src/commands/`
2. Use the following template:

```typescript
import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/discord';
import { createEmbed } from '../../utils/embedBuilder';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('command-name')
    .setDescription('Command description'),
  
  // Optional: add a cooldown in seconds
  cooldown: 5,
  
  async execute(interaction) {
    const embed = createEmbed({
      type: 'primary',
      title: 'Command Title',
      description: 'Command response',
      timestamp: true
    });
    
    await interaction.reply({ embeds: [embed] });
  }
};

export = command;
```

## Database Usage in Commands

To use the database in your commands, import the database factory:

```typescript
import { database } from '../../services/databaseFactory';

// For PostgreSQL-specific features:
import { pgdb } from '../../services/postgresDatabase';
import { config } from '../../config/config';

// Example usage in a command:
async execute(interaction) {
  if (config.DATABASE_TYPE === 'postgres') {
    // PostgreSQL-specific query
    const users = await pgdb.query('SELECT * FROM users LIMIT 10');
    // Use the results...
  } else {
    // Use the database factory for database-agnostic operations
    // (if you've implemented equivalent methods in your JSON database)
  }
}
```

## Command Registration

Commands are now automatically registered with Discord when the bot starts up:

- In development mode (when `isDev` is true in config): Commands are registered to the test guild specified by `TEST_GUILD_ID` in your `.env` file
- In production mode: Commands are registered globally to all servers where your bot is present

This means you no longer need to run a separate command to deploy slash commands after making changes. Simply restart the bot and the commands will be updated automatically.

If you still want to manually deploy commands, you can use:
```
npm run deploy:guild    # Deploy to test guild only
npm run deploy:global   # Deploy globally
npm run deploy:instant  # Quick deploy to test guild
```

## License

MIT 

## Command Categories

*   [Admin](#admin)
*   [Config](#config)
*   [Info](#info)
*   [Moderation](#moderation)
*   [Utility](#utility)

---

## Admin

Commands for server administrators to manage bot permissions.

### `/modroles`

Configure which roles have specific bot permissions (Admin, Moderator, Scheduler, Logger).

*   **Subcommands:**
    *   `add <type> <role>`: Adds the specified role to the permission group (e.g., `/modroles add type:Admin role:@AdminRole`).
    *   `remove <type> <role>`: Removes the specified role from the permission group.
    *   `list`: Lists all roles currently assigned to permission groups.
*   **Permissions:** Discord Administrator

---

## Config

Commands for configuring bot features in the server.

### `/setlfg`

Sets up the Looking For Group (LFG) system in a specific channel.

*   **Usage:** `/setlfg channel:<#channel>`
*   **Details:** When users post in the designated channel, the bot automatically creates a thread for their LFG request.
*   **Bot Permissions Needed (in target channel):** Send Messages, Embed Links, Create Public Threads.
*   **User Permissions:** Manage Channels

### `/setlogs`

Configures server event logging to a specific channel.

*   **Usage:** `/setlogs channel:<#channel>`
*   **Details:** Sets the channel for logs. Presents a menu to select which events (message edits/deletes, member joins/leaves, bans, kicks, voice activity, etc.) should be logged. Requires confirmation.
*   **Bot Permissions Needed (in target channel):** Send Messages, Embed Links.
*   **User Permissions:** Administrator

### `/setwelcome`

Sets the channel where the bot will send welcome messages to new members.

*   **Usage:** `/setwelcome channel:<#channel>`
*   **Bot Permissions Needed (in target channel):** Send Messages, Embed Links.
*   **User Permissions:** Administrator

---

## Info

Commands for retrieving information.

### `/server`

Displays detailed information about the current server.

*   **Details:** Shows server name, icon, owner, ID, creation date, member counts, channel counts, role count, and boost status.
*   **Permissions:** Everyone

---

## Moderation

Commands for server moderation tasks.

### `/ban`

Bans a user from the server.

*   **Usage:** `/ban user:<@user> [reason:<text>] [days:<0-7>]`
*   **Details:** Permanently bans the user. Optionally deletes their messages from the past 0-7 days. Attempts to DM the user before banning. Checks role hierarchy.
*   **Permissions:** Ban Members

### `/kick`

Kicks a member from the server.

*   **Usage:** `/kick user:<@user> [reason:<text>]`
*   **Details:** Removes the user from the server. They can rejoin if invited. Checks role hierarchy and moderator permissions.
*   **Permissions:** Kick Members (or Admin/Moderator role via `/modroles`)

### `/purge`

Deletes multiple messages from a channel.

*   **Usage:** `/purge amount:<1-100> [user:<@user>]`
*   **Details:** Deletes the specified number of recent messages (up to 100). Can optionally filter by user. Only affects messages less than 14 days old.
*   **Permissions:** Manage Messages

### `/unban`

Unbans a previously banned user.

*   **Usage:** `/unban userid:<user_id> [reason:<text>]`
*   **Details:** Requires the User ID as banned users cannot be mentioned.
*   **Permissions:** Ban Members

### `/unwarn`

Removes a specific warning from a user.

*   **Usage:** `/unwarn userid:<user_id> warning_id:<id> [reason:<text>]` OR `/unwarn user:<@user> warning_id:<id> [reason:<text>]`
*   **Details:** Removes a specific warning identified by its ID (use `/warnlogs` to find IDs). Requires User ID if the user is not in the server.
*   **Permissions:** Moderate Members

### `/unwarnall`

Removes all active warnings from a user.

*   **Usage:** `/unwarnall user:<@user> [reason:<text>]`
*   **Details:** Marks all of the user's active warnings as inactive. Attempts to DM the user.
*   **Permissions:** Moderate Members

### `/warn`

Issues a warning to a user.

*   **Usage:** `/warn user:<@user> reason:<text>`
*   **Details:** Records a warning for the user. If a user accumulates 3 active warnings, the bot attempts to automatically kick them. Attempts to DM the user about the warning. Checks role hierarchy.
*   **Permissions:** Moderate Members

### `/warnlogs`

Displays the warning history for a user.

*   **Usage:** `/warnlogs [user:<@user>] [userid:<user_id>] [show_inactive:<True/False>]`
*   **Details:** Shows a list of warnings for the specified user (mention or ID). Optionally includes inactive warnings. Reply is ephemeral.
*   **Permissions:** Moderate Members

---

## Utility

General utility commands and Warframe information commands.

### `/arby`

Shows current and upcoming Warframe Arbitration missions.

*   **Details:** Displays comprehensive Arbitration information including:
    * Current Arbitration (mission tier ranking, node location, mission type, enemy faction, and precise end time)
    * The next 3 upcoming Arbitrations with their details
    * A forecast of noteworthy (S/A tier) Arbitrations scheduled to appear in the next 2 weeks
    * Rankings are based on mission efficiency and reward potential, with S-tier being the most desirable
*   **Permissions:** Everyone

### `/aya`

Shows which Cetus tents currently have Aya-rewarding bounties.

*   **Details:** Checks Konzu and each of the three Plains of Eidolon tents (A, B, C) for specific bounties that can drop Aya, a valuable resource used for Prime Resurgence in Warframe. The command queries real-time data from Warframe's API through browse.wf to provide up-to-date information on where players can efficiently farm Aya. Shows a color-coded (🟢/🔴) listing of which locations have Aya-rewarding bounties, the exact bounty names that reward Aya, and when the current rotation will reset.
*   **Permissions:** Everyone
*   **Example Output:**
    ```
    Warframe Bounties
    Current Bounties
    Reset in 1h 23m
    
    Konzu Bounties:
    🔴 No good bounties available.
    
    Tent A Bounties:
    🟢 Found Aya bounties:
    • Cache Sabotage
    
    Tent B Bounties:
    🔴 No good bounties available.
    
    Tent C Bounties:
    🟢 Found Aya bounties:
    • Capture Target
    ```

### `/baro`

Displays Baro Ki'Teer's current inventory or arrival time.

*   **Usage:** `/baro [channel:<#channel>]`
*   **Details:** Provides real-time information about the void trader Baro Ki'Teer:
    * If Baro is currently present in-game, lists his complete inventory with Ducat and Credit costs for each item, his current location, and exact departure time
    * If Baro is not present, shows his next arrival location and precise countdown timer
    * Items are organized by category (Weapons, Mods, Cosmetics, etc.)
    * Can optionally send the embed to a specific channel for sharing with others
*   **Permissions:** Everyone

### `/cleararby`

Removes the automatic Arbitration notification setup for the server.

*   **Permissions:** Manage Channels
*   *(Note: Seems redundant with `/removearby`)*

### `/clearaya`

Removes the automatic Aya bounty notification setup for the server.

*   **Permissions:** Manage Channels

### `/clearbaro`

Removes the automatic Baro Ki'Teer notification setup for the server.

*   **Permissions:** Manage Channels

### `/clearfissures`

Removes *all* fissure notification setups for the server.

*   **Permissions:** Manage Channels

### `/createrole`

Creates multiple roles at once with random colors.

*   **Usage:** `/createrole names:<name1,name2,name3,...>`
*   **Permissions:** Manage Roles

### `/dbtest`

Tests the connection to the PostgreSQL database.

*   **Details:** Checks connectivity and displays database version and table count.
*   **Permissions:** Everyone (implicitly, but likely intended for admins)

### `/embed`

Create, manage, and send custom embeds.

*   **Subcommands:**
    *   `create <name>`: Start creating a new embed with the given name. Opens a modal for details.
    *   `list`: List all saved embeds with options to view/edit/delete/send.
    *   `view <name>`: Preview a specific saved embed.
    *   `edit <name>`: Edit the properties of a saved embed. Opens a modal.
    *   `delete <name>`: Delete a saved embed (requires confirmation).
    *   `field <add|edit|remove> <embed_name>`: Manage fields within an embed. Opens modals/menus.
    *   `send <name> <channel>`: Send a saved embed to the specified channel.
*   **Permissions:** Manage Messages

### `/fissure`

Displays currently active Warframe Void Fissure missions.

*   **Details:** Provides a comprehensive, organized list of all active Void Fissure missions:
    * Separate sections for Normal and Steel Path fissures
    * Missions sorted by relic tier (Lith, Meso, Neo, Axi, Requiem)
    * Each entry includes mission type, enemy faction, time remaining, and whether it's currently active
    * Special mission types (Void Storms, Kuva Siphon/Flood, etc.) are clearly labeled
    * Updates in real-time based on the Warframe world state API
*   **Permissions:** Everyone

### `/giveaway`

Create and manage giveaways.

*   **Subcommands:**
    *   `create`: Start creating a new giveaway. Opens a modal for prize, duration, winners, etc.
    *   `end <message_id>`: End an active giveaway early.
    *   `reroll <message_id> [winners:<count>]`: Reroll winners for an ended giveaway.
    *   `list`: List all active giveaways in the server.
    *   `delete <message_id>`: Delete a giveaway (requires confirmation).
*   **Permissions:** Manage Events

### `/help`

Shows a list of available commands or details about a specific command.

*   **Usage:** `/help [command:<command_name>]`
*   **Details:** Replies ephemerally.
*   **Permissions:** Everyone

### `/incarnon`

Displays the weekly Warframe Incarnon Circuit rotations.

*   **Details:** Provides a complete breakdown of the Incarnon Genesis (weapon upgrade) system:
    * Shows current Normal and Steel Path reward rotations for all available Incarnon weapons
    * Lists the specific challenges required for each weapon upgrade
    * Displays upcoming Steel Path rotations for planning purposes
    * Includes countdown timer to next rotation change
    * Showcases which challenges are considered "easier" or "harder" to complete
*   **Permissions:** Everyone

### `/lfg`

Manage your Looking For Group (LFG) thread. (Must be used *inside* an LFG thread).

*   **Subcommands:**
    *   `close`: Close the LFG thread and archive it.
    *   `full`: Mark the squad as full (sets player count to 4/4).
    *   `update <players:1-4>`: Update the current player count in the thread title and message.
*   **Permissions:** LFG Host or Manage Threads permission.

### `/lfgstats`

View LFG statistics.

*   **Subcommands:**
    *   `leaderboard`: Show the server's LFG completion leaderboard.
    *   `me`: Show your own LFG stats.
    *   `user <@user>`: Show LFG stats for a specific user.
*   **Permissions:** Everyone

### `/listfissures`

List all configured fissure notifications for the server.

*   **Details:** Shows which mission types are being watched in which channels, including role pings and Steel Path status.
*   **Permissions:** Manage Channels

### `/ping`

Checks the bot's latency.

*   **Details:** Replies with Bot Latency and API Latency.
*   **Permissions:** Everyone

### `/removearby`

Removes the automatic Arbitration notification setup for the server.

*   **Permissions:** Manage Channels
*   *(Note: Seems redundant with `/cleararby`)*

### `/removefissure`

Remove a *specific* fissure notification from the current channel.

*   **Usage:** `/removefissure mission_type:<type> [steel_path:<True/False>]`
*   **Permissions:** Manage Channels

### `/role` (Alias for `/rolereact`)

Create and manage role reaction messages.

*   **Subcommands:**
    *   `create <title> <description> [channel:<#channel>] [color:<hex>]`: Create a new role reaction message embed.
    *   `batchadd <message_id> <roles:"@Role:emoji,@Role2:emoji2,..."> [style:<style>]`: Add multiple role buttons at once.
    *   `quickadd <message_id> <role> <emoji> [label:<text>] [style:<style>]`: Add a single role button.
    *   `list`: List all role reaction messages in the server.
    *   `delete <message_id>`: Delete a role reaction message.
    *   `removerole <message_id> <role>`: Remove a specific role button from a message.
*   **Permissions:** Manage Roles

### `/rolereact`

Create and manage role reaction messages. (See `/role` for details)

*   **Permissions:** Manage Roles

### `/setarby`

Set up automatic Warframe Arbitration notifications.

*   **Usage:** `/setarby channel:<#channel> [s_tier_role:<@role>] [a_tier_role:<@role>] ... [f_tier_role:<@role>]`
*   **Details:** Configures a channel for Arbitration updates. Optionally specify roles to ping for each tier (S, A, B, C, D, F).
*   **Permissions:** Manage Channels

### `/setaya`

Set up automatic Warframe Aya bounty notifications.

*   **Usage:** `/setaya channel:<#channel> [ping_role:<@role>]`
*   **Details:** Configures a channel for Aya bounty updates. Optionally specify a role to ping when Aya bounties are found.
*   **Permissions:** Manage Channels

### `/setbaro`

Set up automatic Baro Ki'Teer schedule and inventory updates.

*   **Usage:** `/setbaro channel:<#channel> [ping_role:<@role>]`
*   **Details:** Configures a channel for Baro updates. Optionally specify a role to ping when Baro arrives.
*   **Permissions:** Manage Channels

### `/setfissure`

Set up notifications for specific Warframe Void Fissure mission types in the current channel.

*   **Usage:** `/setfissure mission_type:<type> [ping_role:<@role>] [steel_path:<True/False>]`
*   **Details:** Creates an automated notification system for specific Void Fissure mission types:
    * Configure notifications for any mission type (Survival, Defense, Capture, Exterminate, etc.)
    * Supports both regular and Steel Path fissure tracking
    * When matching fissures appear in-game, an embed is automatically sent to the configured channel
    * The embed includes mission details, time remaining, and relic tier
    * Optionally specify a role to ping when these missions appear
    * Can set up multiple mission types in different channels for efficient monitoring
    * Perfect for communities focusing on specific mission types for relic farming
*   **Permissions:** Manage Channels

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/korptair.git
cd korptair

# Install dependencies
npm install

# Install PM2 globally (important!)
npm install pm2 -g

# Build the project
npm run build
```

## Running with PM2

```bash
# Start the bot with PM2
npm run pm2:start

# View logs
npm run pm2:logs
# or
pm2 logs korptair-bot

# Monitor the application
npm run pm2:monit
# or
pm2 monit

# Reload after code changes
npm run build
npm run pm2:reload

# Stop the application
npm run pm2:stop
```

## Common Issues

If you see "Command 'pm2' not found" when running pm2 commands directly:
1. Install PM2 globally: `npm install pm2 -g`
2. Or use npm scripts: `npm run pm2:logs` instead of `pm2 logs` 