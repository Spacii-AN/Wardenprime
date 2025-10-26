# Giveaway Host Feature Migration

## Overview
Added the ability to specify a host for giveaways, allowing users to pick a giveaway host from guild members with autocomplete.

## Changes Made

### 1. Database Schema Changes
- **File**: `src/services/migrations/add_giveaway_host.sql`
- **Changes**: Added `host_id` column to `giveaways` table
- **Migration**: Run `node dist/services/runGiveawayHostMigration.js` after database is set up

### 2. Database Interface Updates
- **File**: `src/services/postgresDatabase.ts`
- **Changes**: 
  - Added `host_id: string | null` to `Giveaway` interface
  - Updated `createGiveaway` method signature to include `hostId` parameter
  - Updated SQL query to include `host_id` field

### 3. Command Updates
- **File**: `src/commands/utility/giveaway.ts`
- **Changes**:
  - Added `host` user option to the `create` subcommand with autocomplete
  - Updated modal custom ID to include host information
  - Updated modal submit handler to extract and pass host ID
  - Updated `createGiveawayEmbed` to display host information when available

## How to Use

### For Users
1. Use `/giveaway create` command
2. Optionally specify a host using the `host` parameter (autocomplete will show guild members)
3. Fill out the giveaway details in the modal
4. The giveaway embed will show the host information if specified

### For Developers
1. Run the database migration: `node dist/services/runGiveawayHostMigration.js`
2. The host field is optional - if not specified, no host will be shown
3. Host information appears in the giveaway embed as "🎭 Host: @username"

## Database Migration Required
Before using this feature, you must run the database migration to add the `host_id` column:

### Option 1: Manual Migration (Recommended)
```bash
# Connect to your database and run these SQL commands:
docker exec wardenprime-postgres-dev psql -U wardenprime -d wardenprime -c "ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS host_id VARCHAR(255);"
docker exec wardenprime-postgres-dev psql -U wardenprime -d wardenprime -c "CREATE INDEX IF NOT EXISTS idx_giveaways_host_id ON giveaways(host_id);"
```

### Option 2: Automated Migration
```bash
# Build the project first
npm run build

# Run the migration (ensure database is running)
node dist/services/runGiveawayHostMigration.js
```

**Note**: The automated migration script may have connection issues. Use the manual approach for reliability.

## Features
- ✅ User autocomplete for host selection
- ✅ Optional host field (backward compatible)
- ✅ Host information displayed in giveaway embeds
- ✅ Database schema updated with proper indexing
- ✅ TypeScript types updated
- ✅ No breaking changes to existing functionality
