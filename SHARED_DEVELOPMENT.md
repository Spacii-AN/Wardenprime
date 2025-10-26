# Shared Development Server Setup

This guide covers how to set up the WardenPrime bot for development when multiple developers want to use the same Discord server for testing.

## The Challenge

When using the same Discord server for development, you need to handle:
- **Command conflicts** - Multiple bots can't register the same commands
- **Database conflicts** - Both developers might modify the same data
- **Bot token management** - Only one bot can be active at a time
- **Testing coordination** - Avoiding interference between developers

## Solutions

### Option 1: Single Bot, Multiple Databases (Recommended)

**How it works:**
- One developer runs the bot with their token
- Each developer has their own database
- Use database switching or environment variables to change data source

**Setup:**
```bash
# Developer 1 (runs the bot)
./setup-dev.sh
# Uses: BOT_TOKEN=dev1_token, PG_DATABASE=wardenprime_dev_alice

# Developer 2 (connects to shared bot)
./setup-dev-shared.sh
# Uses: BOT_TOKEN=dev1_token, PG_DATABASE=wardenprime_dev_bob
```

### Option 2: Bot Token Rotation

**How it works:**
- Developers take turns using the bot token
- When not developing, stop the bot and let the other developer use it
- Use a shared communication channel (Discord, Slack, etc.)

**Setup:**
```bash
# Developer 1 starts development
docker-compose up -d
# ... do development work ...
docker-compose down

# Developer 2 takes over
docker-compose up -d
# ... do development work ...
docker-compose down
```

### Option 3: Multiple Bots, Same Server

**How it works:**
- Each developer has their own bot in the same server
- Use different command prefixes to avoid conflicts
- Coordinate on testing to avoid confusion

**Setup:**
```bash
# Developer 1
BOT_PREFIX=!dev1
BOT_NAME=WardenPrime-Alice

# Developer 2  
BOT_PREFIX=!dev2
BOT_NAME=WardenPrime-Bob
```

## Implementation

### Shared Development Setup Script

Let me create a script for shared development:

```bash
#!/bin/bash
# setup-dev-shared.sh - For developers using shared Discord server

echo "🤝 Shared Development Setup"
echo "==========================="
echo ""

read -p "Enter your name: " DEV_NAME
read -p "Enter the shared bot token: " SHARED_BOT_TOKEN
read -p "Enter the shared client ID: " SHARED_CLIENT_ID
read -p "Enter the shared guild ID: " SHARED_GUILD_ID
read -p "Enter your Discord user ID: " BOT_OWNER_ID

# Create .env for shared development
cat > .env << EOF
# Shared Development Environment
DEV_NAME=${DEV_NAME}
BOT_TOKEN=${SHARED_BOT_TOKEN}
CLIENT_ID=${SHARED_CLIENT_ID}
TEST_GUILD_ID=${SHARED_GUILD_ID}
BOT_OWNER_ID=${BOT_OWNER_ID}

# Use your own database
PG_DATABASE=wardenprime_dev_${DEV_NAME}
PG_USER=${DEV_NAME}
PG_PASSWORD=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-16)

# Development settings
NODE_ENV=development
LOG_LEVEL=DEBUG
COMMAND_DEPLOYMENT_MODE=guild
DEPLOYMENT_GUILD_IDS=${SHARED_GUILD_ID}
EOF

echo "✅ Shared development environment created"
```

### Database Isolation

Even with shared Discord server, each developer should have their own database:

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  postgres:
    environment:
      POSTGRES_DB: wardenprime_dev_${DEV_NAME}
      POSTGRES_USER: ${DEV_NAME}
      POSTGRES_PASSWORD: ${DEV_PASSWORD}
    volumes:
      - postgres_data_${DEV_NAME}:/var/lib/postgresql/data
```

### Command Management

**Option A: Single Bot, Database Switching**
```typescript
// In your bot code, switch databases based on environment
const database = process.env.DEV_NAME === 'alice' ? 'wardenprime_dev_alice' : 'wardenprime_dev_bob';
```

**Option B: Multiple Bots, Different Prefixes**
```env
# Developer 1
BOT_PREFIX=!dev1
BOT_NAME=WardenPrime-Alice

# Developer 2
BOT_PREFIX=!dev2  
BOT_NAME=WardenPrime-Bob
```

## Best Practices

### 1. Communication Protocol

**Before starting development:**
- Check if the bot is already running
- Coordinate with other developers
- Use a shared channel for status updates

**Example Discord channel:**
```
#dev-status
Alice: Starting development, bot will be down for 30 minutes
Bob: Got it, I'll wait
Alice: Done, bot is back up
```

### 2. Development Schedule

**Option A: Time-based rotation**
```
Monday/Wednesday/Friday: Alice develops
Tuesday/Thursday/Saturday: Bob develops  
Sunday: Integration testing
```

**Option B: Feature-based rotation**
```
Alice: Working on embed customization
Bob: Working on command system
```

### 3. Database Coordination

**Shared data considerations:**
- User data (if testing with real users)
- Guild settings
- Custom embeds
- Join form submissions

**Solutions:**
- Use test data that doesn't conflict
- Coordinate on database changes
- Use separate test users

### 4. Testing Strategy

**Individual Testing:**
- Each developer tests their features
- Use different test channels
- Coordinate test scenarios

**Integration Testing:**
- Weekly integration sessions
- Test all features together
- Resolve conflicts

## Advanced Solutions

### Bot Token Sharing with Automation

**Create a token sharing system:**

```bash
#!/bin/bash
# request-bot-token.sh

# Check if bot is available
if curl -s http://localhost:3081/api/bot/status | grep -q "online"; then
    echo "❌ Bot is currently in use"
    echo "Current user: $(cat .bot-user 2>/dev/null || echo 'Unknown')"
    exit 1
fi

# Request bot access
echo "🤖 Requesting bot access..."
echo "$(whoami) $(date)" > .bot-user
echo "✅ Bot access granted"
```

### Database Synchronization

**For shared data testing:**

```bash
#!/bin/bash
# sync-dev-data.sh

# Export data from one developer's database
pg_dump wardenprime_dev_alice > alice_data.sql

# Import to another developer's database  
psql wardenprime_dev_bob < alice_data.sql

echo "✅ Data synchronized"
```

### Development Bot Management

**Create a development bot manager:**

```typescript
// dev-bot-manager.ts
class DevBotManager {
  private static currentUser: string | null = null;
  
  static async requestAccess(user: string): Promise<boolean> {
    if (this.currentUser && this.currentUser !== user) {
      return false; // Bot in use
    }
    
    this.currentUser = user;
    return true;
  }
  
  static releaseAccess(): void {
    this.currentUser = null;
  }
}
```

## Recommended Approach

For your situation, I recommend:

1. **Use Option 1: Single Bot, Multiple Databases**
2. **Create a simple coordination system**
3. **Use separate databases for isolation**
4. **Coordinate testing schedules**

This gives you:
- ✅ Shared Discord server for testing
- ✅ Isolated development environments  
- ✅ No command conflicts
- ✅ Easy coordination

Would you like me to create the specific setup scripts for this approach?
