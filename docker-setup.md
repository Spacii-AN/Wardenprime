# Docker Setup for WardenPrime Discord Bot

This guide will help you set up WardenPrime with Docker and PostgreSQL.

## Prerequisites

- Docker and Docker Compose installed
- Discord Bot Token and Client ID

## Quick Start

### Option 1: Automated Setup Scripts

**Linux/macOS:**
```bash
# Start everything (auto-setup if needed)
./start-dev.sh

# Stop everything
./stop-dev.sh
```

**Windows:**
```cmd
# Start everything (auto-setup if needed)
start-dev.bat

# Stop everything
stop-dev.bat
```

### Option 2: Manual Setup

1. **Copy the environment template:**
   ```bash
   # Linux/macOS
   cp env.template .env
   
   # Windows
   copy env.template .env
   ```

2. **Edit the `.env` file with your Discord bot credentials:**
   ```bash
   # Linux/macOS
   nano .env
   
   # Windows
   notepad .env
   ```
   
   At minimum, you need to set:
   - `BOT_TOKEN=your_discord_bot_token_here`
   - `CLIENT_ID=your_discord_client_id_here`

3. **Start the services:**
   ```bash
   # Start bot and database
   docker-compose up -d
   
   # Or start with dashboard (optional)
   docker-compose --profile dashboard up -d
   ```

4. **Check logs:**
   ```bash
   # Bot logs
   docker-compose logs -f bot
   
   # Database logs
   docker-compose logs -f postgres
   ```

## Services

### PostgreSQL Database
- **Container:** `wardenprime-postgres`
- **Port:** 5432 (mapped to host)
- **Database:** `wardenprime`
- **User:** `wardenprime`
- **Password:** `wardenprime_password`

### Discord Bot
- **Container:** `wardenprime-bot`
- **Depends on:** PostgreSQL (waits for healthy database)
- **Volumes:** 
  - `./logs` → `/app/logs`
  - `./data` → `/app/data`

### Dashboard (Optional)
- **Container:** `wardenprime-dashboard`
- **Port:** 3080 (mapped to host)
- **Profile:** `dashboard` (only starts with `--profile dashboard`)

## Environment Variables

### Required
- `BOT_TOKEN` - Your Discord bot token
- `CLIENT_ID` - Your Discord application client ID

### Database (Docker)
- `PG_DATABASE` - Database name (default: wardenprime)
- `PG_USER` - Database user (default: wardenprime)
- `PG_PASSWORD` - Database password (default: wardenprime_password)
- `PG_PORT` - Database port (default: 5432)

### Optional
- `BOT_NAME` - Bot display name (default: WardenPrime)
- `BOT_PREFIX` - Command prefix (default: !)
- `BOT_OWNER_ID` - Bot owner Discord ID
- `DASHBOARD_ENABLED` - Enable dashboard (default: false)
- `NODE_ENV` - Environment (default: production)

## Platform-Specific Setup

### Windows Users

**Option 1: Command Prompt (docker-start.bat)**
- Double-click `docker-start.bat` or run from Command Prompt
- Automatically creates directories, checks Docker, and starts services
- Opens `.env` file in Notepad for editing if needed

**Option 2: PowerShell (docker-start.ps1)**
- Right-click `docker-start.ps1` → "Run with PowerShell"
- Or run: `.\docker-start.ps1`
- Enhanced with colored output and better error handling

**Option 3: Manual Setup**
```cmd
copy env.template .env
notepad .env
docker-compose up -d
```

### Linux/macOS Users

**Option 1: Shell Script (docker-start.sh)**
```bash
chmod +x docker-start.sh
./docker-start.sh
```

**Option 2: Manual Setup**
```bash
cp env.template .env
nano .env
docker-compose up -d
```

## Commands

```bash
# Start all services
docker-compose up -d

# Start with dashboard
docker-compose --profile dashboard up -d

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes database data)
docker-compose down -v

# View logs
docker-compose logs -f [service_name]

# Rebuild and restart
docker-compose up -d --build

# Execute commands in running container
docker-compose exec bot sh
docker-compose exec postgres psql -U wardenprime -d wardenprime
```

## Data Persistence

- **Database data:** Stored in Docker volume `postgres_data`
- **Bot logs:** Stored in `./logs` directory
- **Bot data:** Stored in `./data` directory

## Troubleshooting

### Bot won't start
1. Check if PostgreSQL is healthy: `docker-compose ps`
2. Check bot logs: `docker-compose logs bot`
3. Verify environment variables in `.env`

### Database connection issues
1. Check PostgreSQL logs: `docker-compose logs postgres`
2. Verify database credentials in `.env`
3. Ensure PostgreSQL container is healthy

### Permission issues
1. Check file permissions: `ls -la logs/ data/`
2. Fix permissions: `sudo chown -R $USER:$USER logs/ data/`

## Development

For development with hot reload:

```bash
# Run in development mode
NODE_ENV=development docker-compose up -d postgres

# Run bot locally with Docker database
npm run dev
```

## Production Deployment

1. Set strong passwords in `.env`
2. Enable SSL for database if needed
3. Configure proper logging
4. Set up monitoring and backups
5. Use Docker secrets for sensitive data

## Security Notes

- Change default database passwords
- Use Docker secrets for production
- Keep `.env` file secure and never commit it
- Regularly update Docker images
