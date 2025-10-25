# Embed Customization Feature

This document describes the new embed customization feature that allows server administrators to customize bot embed appearance through the dashboard.

## Overview

The embed customization feature allows server administrators to:
- Customize embed colors (primary, success, error, warning, info)
- Set default footer text
- Configure author information (name, icon, URL)
- Control timestamp and author display
- Preview changes in real-time
- Test embeds directly in Discord

## Architecture

### Database Schema

The feature uses a new `embed_settings` table with the following structure:

```sql
CREATE TABLE embed_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL,
    setting_name VARCHAR(50) NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, setting_name)
);
```

### Settings Hierarchy

1. **Guild-specific settings** - Override global defaults for specific servers
2. **Global defaults** - Fallback values used when guild settings don't exist
3. **Hardcoded fallbacks** - Final fallback in embedBuilder.ts

### Available Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `primary_color` | color | Primary embed color | #5865F2 |
| `success_color` | color | Success embed color | #57F287 |
| `error_color` | color | Error embed color | #ED4245 |
| `warning_color` | color | Warning embed color | #FEE75C |
| `info_color` | color | Info embed color | #5865F2 |
| `default_footer` | string | Default footer text | "Powered by WardenPrime" |
| `default_author_name` | string | Default author name | "WardenPrime" |
| `default_author_icon` | string | Default author icon URL | Bot icon URL |
| `default_author_url` | string | Default author URL | "" |
| `show_timestamp` | boolean | Show timestamp by default | true |
| `show_author` | boolean | Show author by default | true |

## Implementation Details

### Database Layer

**File**: `src/services/postgresDatabase.ts`

New methods added to `PostgresDatabase` class:
- `getEmbedSetting(guildId, settingName)` - Get single setting with fallback
- `getAllEmbedSettings(guildId)` - Get all settings with fallbacks
- `setEmbedSetting(guildId, settingName, value, type, description)` - Set setting
- `resetEmbedSetting(guildId, settingName)` - Reset to global default
- `getEmbedColors(guildId)` - Get color settings as hex strings

### Embed Builder

**File**: `src/utils/embedBuilder.ts`

Updated `createEmbed` function:
- Now accepts `guildId` parameter
- Fetches guild-specific colors and settings from database
- Falls back to hardcoded defaults if database unavailable
- Maintains backward compatibility with `createEmbedSync`

### Dashboard UI

**File**: `dashboard/views/embeds/settings.ejs`

Features:
- Real-time preview of embed appearance
- Color picker for all embed colors
- Form fields for text settings
- Toggle switches for boolean settings
- Save, reset, and test functionality

### API Endpoints

**Bot API** (`src/api/botAPI.ts`):
- `GET /api/bot/embeds/settings/:guildId` - Get settings
- `POST /api/bot/embeds/settings/:guildId` - Update settings
- `POST /api/bot/embeds/settings/:guildId/reset` - Reset to defaults
- `POST /api/bot/embeds/test/:guildId` - Send test embed

**Dashboard API** (`dashboard/src/server.ts`):
- `GET /embeds` - Settings page
- `GET /api/embeds/settings` - Get settings via dashboard
- `POST /api/embeds/settings` - Update settings via dashboard
- `POST /api/embeds/settings/reset` - Reset settings via dashboard
- `POST /api/embeds/test` - Test embed via dashboard

## Usage

### For Developers

#### Using the New Embed Builder

```typescript
import { createEmbed } from '../utils/embedBuilder';

// With guild-specific customization
const embed = await createEmbed({
  type: 'success',
  title: 'Success!',
  description: 'Operation completed successfully.',
  guildId: interaction.guildId // This enables database customization
});

// Without customization (uses defaults)
const embed = createEmbedSync({
  type: 'success',
  title: 'Success!',
  description: 'Operation completed successfully.'
});
```

#### Database Operations

```typescript
import { pgdb } from '../services/postgresDatabase';

// Get all settings for a guild
const settings = await pgdb.getAllEmbedSettings(guildId);

// Set a specific setting
await pgdb.setEmbedSetting(guildId, 'primary_color', '#FF0000', 'color');

// Reset a setting to global default
await pgdb.resetEmbedSetting(guildId, 'primary_color');
```

### For Administrators

1. **Access the Dashboard**: Navigate to your bot's dashboard
2. **Go to Embed Settings**: Click "🎨 Embed Settings" on the home page
3. **Customize Settings**: Use the form to customize colors and appearance
4. **Preview Changes**: See real-time preview of how embeds will look
5. **Save Settings**: Click "💾 Save Settings" to apply changes
6. **Test Embed**: Click "🧪 Test Embed" to send a test embed to your server
7. **Reset if Needed**: Click "🔄 Reset to Defaults" to restore original settings

## Migration

### Running the Migration

The migration is automatically run when using Docker:

```bash
docker-compose up -d
```

For manual migration:

```bash
npm run migrate:embeds
```

### Migration Script

**File**: `src/scripts/run-embed-settings-migration.ts`

The migration script:
1. Creates the `embed_settings` table
2. Inserts global default settings
3. Creates helper functions for setting retrieval
4. Verifies the migration was successful

## Configuration

### Environment Variables

The following environment variables are still supported as fallbacks:

```env
EMBED_COLOR=5865F2          # Fallback primary color
EMBED_FOOTER=Powered by WardenPrime  # Fallback footer
```

### Docker Configuration

The Docker setup automatically runs the migration on startup:

```yaml
command: >
  sh -c "
    echo 'Running embed settings migration...' &&
    npm run migrate:embeds &&
    echo 'Starting bot...' &&
    npm start
  "
```

## Troubleshooting

### Common Issues

1. **Migration Fails**: Ensure PostgreSQL is running and accessible
2. **Settings Not Applied**: Check that the guild ID is correct
3. **Dashboard Not Loading**: Verify dashboard is enabled and API is running
4. **Test Embed Fails**: Ensure bot has permissions in the target channel

### Debugging

Enable debug logging to see embed customization in action:

```typescript
// In your bot code
logger.debug('Using guild-specific embed colors:', colors);
logger.debug('Using guild-specific embed settings:', settings);
```

### Database Queries

Check embed settings in the database:

```sql
-- View all settings for a guild
SELECT * FROM embed_settings WHERE guild_id = 'your_guild_id';

-- View global defaults
SELECT * FROM embed_settings WHERE guild_id = 'global';

-- Check if a specific setting exists
SELECT * FROM embed_settings 
WHERE guild_id = 'your_guild_id' AND setting_name = 'primary_color';
```

## Future Enhancements

Potential improvements for the embed customization feature:

1. **Per-Command Customization**: Allow different settings for different commands
2. **Template System**: Save and load embed templates
3. **Bulk Import/Export**: Import/export settings between servers
4. **Advanced Styling**: Support for custom CSS-like styling
5. **A/B Testing**: Test different embed styles with user groups
6. **Analytics**: Track which embed styles perform better

## Security Considerations

- Settings are scoped to guild IDs to prevent cross-server access
- Dashboard requires proper authentication and permissions
- API endpoints validate API keys and user permissions
- Database queries use parameterized statements to prevent SQL injection

## Performance Considerations

- Settings are cached in memory for fast access
- Database queries are optimized with proper indexes
- Fallback system ensures embeds work even if database is unavailable
- Async operations don't block the main bot thread
