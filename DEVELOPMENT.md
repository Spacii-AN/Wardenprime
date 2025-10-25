# Development Guide

This guide covers how to set up the WardenPrime bot for local development when multiple developers are working on the project.

## Multi-Developer Setup

### The Problem
When multiple developers work on the same bot project, you need to handle:
- Different Discord bot tokens
- Different test guild IDs
- Database conflicts
- Environment configuration

### The Solution

#### 1. Environment File Management

**Each developer should have their own `.env` file:**

```bash
# Each developer creates their own .env from the template
cp env.template .env
```

**Never commit `.env` to git** - it contains sensitive tokens!

#### 2. Discord Bot Setup

**Each developer needs their own Discord application:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application for development
3. Create a bot user
4. Get your own `BOT_TOKEN` and `CLIENT_ID`
5. Add your bot to a test server

#### 3. Database Isolation

**Option A: Separate Databases (Recommended)**
```env
# Developer 1
PG_DATABASE=wardenprime_dev_alice
PG_USER=alice
PG_PASSWORD=alice_password

# Developer 2  
PG_DATABASE=wardenprime_dev_bob
PG_USER=bob
PG_PASSWORD=bob_password
```

**Option B: Shared Database with Different Guilds**
```env
# Both use same database but different test guilds
PG_DATABASE=wardenprime_dev
TEST_GUILD_ID=alice_test_guild_id  # Different for each dev
```

#### 4. Command Deployment

**Use guild-specific deployment for development:**
```env
COMMAND_DEPLOYMENT_MODE=guild
DEPLOYMENT_GUILD_IDS=your_test_guild_id_here
```

This prevents commands from being deployed globally during development.

## Development Workflow

### Initial Setup (Each Developer)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd WardenPrime
   ```

2. **Create your environment:**
   ```bash
   # Linux/macOS
   cp env.template .env
   
   # Windows
   copy env.template .env
   ```

3. **Configure your `.env`:**
   ```bash
   # Edit with your Discord bot credentials
   nano .env  # Linux/macOS
   notepad .env  # Windows
   ```

4. **Start development environment:**
   ```bash
   # Linux/macOS
   ./docker-start.sh
   
   # Windows
   docker-start.bat
   # or
   .\docker-start.ps1
   ```

### Daily Development

1. **Pull latest changes:**
   ```bash
   git pull origin main
   ```

2. **Start your development environment:**
   ```bash
   docker-compose up -d
   ```

3. **Make changes and test**

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

## Environment Configuration

### Required Settings (Per Developer)

```env
# Your Discord bot credentials
BOT_TOKEN=your_own_bot_token
CLIENT_ID=your_own_client_id
TEST_GUILD_ID=your_test_server_id

# Your database (isolated)
PG_DATABASE=wardenprime_dev_yourname
PG_USER=yourname
PG_PASSWORD=your_password

# Development settings
NODE_ENV=development
LOG_LEVEL=DEBUG
COMMAND_DEPLOYMENT_MODE=guild
DEPLOYMENT_GUILD_IDS=your_test_guild_id
```

### Optional Settings

```env
# Dashboard (useful for development)
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3080
DASHBOARD_SESSION_SECRET=your_dev_secret

# Bot customization
BOT_NAME=WardenPrime-Dev
BOT_OWNER_ID=your_discord_user_id
```

## Database Management

### Separate Databases (Recommended)

Each developer gets their own database:

```yaml
# docker-compose.override.yml (create this file)
version: '3.8'
services:
  postgres:
    environment:
      POSTGRES_DB: wardenprime_dev_alice  # Change per developer
      POSTGRES_USER: alice
      POSTGRES_PASSWORD: alice_password
    volumes:
      - postgres_data_alice:/var/lib/postgresql/data  # Separate volume

volumes:
  postgres_data_alice:
```

### Shared Database (Alternative)

If you want to share a database:

1. **Use different guild IDs for testing**
2. **Coordinate on database changes**
3. **Be careful with migrations**

## Git Workflow

### Files to Ignore

Make sure `.gitignore` includes:
```
.env
.env.local
.env.*.local
logs/
data/
```

### Files to Commit

Always commit:
- `env.template` (updated template)
- `docker-start.sh`, `docker-start.bat`, `docker-start.ps1`
- `docker-compose.yml`
- Source code changes

### Never Commit

- `.env` files (contains tokens)
- `logs/` directory
- `data/` directory
- Personal configuration

## Testing Strategy

### Individual Testing

Each developer tests with their own:
- Discord bot
- Test server
- Database
- Environment

### Integration Testing

1. **Use a shared test server** for integration tests
2. **Coordinate on database schema changes**
3. **Test with production-like environment**

## Troubleshooting

### Common Issues

1. **Bot token conflicts**: Each dev needs their own bot
2. **Database conflicts**: Use separate databases
3. **Command conflicts**: Use guild deployment mode
4. **Port conflicts**: Use different ports if needed

### Solutions

```bash
# Check if ports are in use
netstat -tulpn | grep :3080  # Linux
netstat -an | findstr :3080  # Windows

# Use different ports
DASHBOARD_PORT=3081  # For second developer
```

## Best Practices

1. **Always use your own bot token**
2. **Use guild deployment for commands**
3. **Keep your `.env` file local**
4. **Coordinate on database changes**
5. **Test thoroughly before pushing**
6. **Use descriptive commit messages**

## Production Deployment

When ready for production:

1. **Use production environment variables**
2. **Deploy to production server**
3. **Use global command deployment**
4. **Configure production database**
5. **Set up monitoring and logging**

## Team Communication

- **Share test server IDs** for integration testing
- **Coordinate on database migrations**
- **Discuss breaking changes** before implementing
- **Use pull requests** for code review
- **Keep documentation updated**
