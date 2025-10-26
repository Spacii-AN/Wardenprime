# Thread Auto-Join Filtering

This feature allows server administrators to control which channels the bot will automatically join threads in, providing fine-grained control over bot behavior.

## Overview

By default, the bot automatically joins all threads created in the server. With this feature, you can:

- **Allow all channels** (default behavior)
- **Whitelist specific channels** - Bot only joins threads in specified channels
- **Blacklist specific channels** - Bot joins threads in all channels except specified ones

## Configuration

Use the `/setthreadjoin` command to configure thread auto-join behavior:

### Basic Usage

```
/setthreadjoin mode:all
```
Sets the bot to join threads in all channels (default behavior).

### Whitelist Mode

```
/setthreadjoin mode:whitelist
```
Sets the bot to only join threads in whitelisted channels.

```
/setthreadjoin mode:whitelist channel:#general action:add
```
Adds #general to the whitelist.

```
/setthreadjoin mode:whitelist channel:#lfg action:add
```
Adds #lfg to the whitelist.

### Blacklist Mode

```
/setthreadjoin mode:blacklist
```
Sets the bot to join threads in all channels except blacklisted ones.

```
/setthreadjoin mode:blacklist channel:#spam action:add
```
Adds #spam to the blacklist (bot won't join threads in #spam).

```
/setthreadjoin mode:blacklist channel:#off-topic action:add
```
Adds #off-topic to the blacklist.

### Managing Channel Lists

```
/setthreadjoin mode:whitelist channel:#general action:remove
```
Removes #general from the whitelist.

```
/setthreadjoin mode:blacklist channel:#spam action:remove
```
Removes #spam from the blacklist.

## Database Schema

The feature adds two new columns to the `guild_settings` table:

- `thread_auto_join_mode`: VARCHAR(20) - 'all', 'whitelist', or 'blacklist'
- `thread_channels`: TEXT - JSON array of channel IDs

## Technical Implementation

### Database Methods

- `setThreadAutoJoinMode(guildId, mode)` - Set the filtering mode
- `getThreadChannels(guildId)` - Get the list of channel IDs
- `setThreadChannels(guildId, channelIds)` - Set the entire channel list
- `addThreadChannel(guildId, channelId)` - Add a channel to the list
- `removeThreadChannel(guildId, channelId)` - Remove a channel from the list
- `shouldAutoJoinThread(guildId, parentChannelId)` - Check if bot should join a thread

### Event Handler

The `threadCreate` event now checks the guild settings before auto-joining:

1. Gets the guild's thread auto-join mode
2. Checks if the parent channel is in the appropriate list
3. Only joins the thread if the filtering rules allow it

## Use Cases

### Gaming Communities
- **Whitelist**: Only join threads in #lfg, #missions, #events
- **Blacklist**: Join all threads except #off-topic, #memes

### Support Servers
- **Whitelist**: Only join threads in #support, #bug-reports
- **Blacklist**: Join all threads except #general-chat

### Development Teams
- **Whitelist**: Only join threads in #project-discussions, #code-review
- **Blacklist**: Join all threads except #water-cooler, #random

## Permissions

The `/setthreadjoin` command requires the `Manage Channels` permission.

## Migration

When upgrading to this version:

1. Run the complete database initialization: `npm run db:init`
2. This will add the new columns with default values
3. Existing behavior is preserved (mode defaults to 'all')

## Logging

The bot logs thread join decisions:
- `Successfully joined thread: [name] ([id])` - When joining
- `Skipped joining thread: [name] ([id]) - filtered by guild settings` - When filtering

## Error Handling

- If database is unavailable, defaults to joining all threads
- If guild settings are missing, defaults to joining all threads
- Invalid modes default to 'all' behavior
