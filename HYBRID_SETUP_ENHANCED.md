# WardenPrime Enhanced Hybrid Development Setup

This guide covers the updated hybrid development setup with the enhanced admin dashboard.

## 🚀 Quick Start

### Single Command Launch
```bash
# Linux/macOS
./start-dev-hybrid.sh

# Windows
start-dev-hybrid.bat
```

This single command will:
- ✅ Start PostgreSQL database in Docker
- ✅ Start enhanced admin dashboard in Docker  
- ✅ Start the bot locally
- ✅ Set up all necessary connections

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Bot (Local)   │    │  Database       │    │  Dashboard      │
│                 │    │  (Docker)       │    │  (Docker)       │
│  - Discord API  │◄──►│  - PostgreSQL   │◄──►│  - Web UI       │
│  - Commands     │    │  - Data Storage │    │  - Admin Panel  │
│  - Events       │    │  - Migrations   │    │  - Analytics    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 What's Included

### Enhanced Admin Dashboard Features
- **🔐 Discord OAuth Authentication** - Secure login with Discord accounts
- **👋 Welcome Messages** - Custom welcome messages with variables and embeds
- **🎭 Role Commands** - Create custom role assignment slash commands
- **🎁 Giveaway Management** - Full giveaway creation and management
- **🔔 Fissure Notifications** - Warframe fissure notification system
- **📊 Analytics Dashboard** - Server statistics and usage analytics
- **📝 Logs Viewer** - Real-time bot activity monitoring
- **🛡️ Moderation Tools** - User management and warning system

### Services Started
1. **PostgreSQL Database** (Docker)
   - Port: `5432`
   - Database: `wardenprime`
   - User: `wardenprime`
   - Password: `wardenprime_password`

2. **Enhanced Dashboard** (Docker)
   - Port: `3080`
   - URL: `http://localhost:3080`
   - Features: Full admin panel with all management tools

3. **WardenPrime Bot** (Local)
   - Runs locally
   - Connects to Docker database
   - All bot functionality available

## 📋 Prerequisites

### Required Software
- **Node.js 18+** - For running the bot locally
- **Docker & Docker Compose** - For database and dashboard
- **Git** - For version control

### Optional (for full OAuth)
- **Discord Application** - For Discord OAuth authentication
  - Create at: https://discord.com/developers/applications
  - Enable OAuth2 with scopes: `identify`, `guilds`
  - Set redirect URI: `http://localhost:3080/auth/callback`

## 🚀 Setup Instructions

### 1. Initial Setup
```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd WardenPrime

# Make scripts executable (Linux/macOS)
chmod +x start-dev-hybrid.sh stop-dev-hybrid.sh
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```bash
# Copy the template
cp env.template .env

# Edit with your settings
nano .env  # or use your preferred editor
```

**Required Environment Variables:**
```bash
# Discord Bot Token (REQUIRED)
DISCORD_TOKEN=your-bot-token-here

# Database Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=wardenprime
PG_USER=wardenprime
PG_PASSWORD=wardenprime_password
PG_SSL_MODE=disable

# Dashboard Configuration
DASHBOARD_SESSION_SECRET=your-super-secret-key-here

# Optional: Discord OAuth (for full authentication)
CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
OAUTH_DISABLED=false
```

### 3. Launch Everything
```bash
# Linux/macOS
./start-dev-hybrid.sh

# Windows
start-dev-hybrid.bat
```

## 🔗 Access Points

After running the setup:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | http://localhost:3080 | Enhanced admin dashboard |
| **Database** | localhost:5432 | PostgreSQL database |
| **Bot** | N/A | Running locally (no web interface) |

## 🎛️ Dashboard Features

### Server Management
- **Multi-Server Support** - Switch between Discord servers
- **Permission Checks** - Only administrators can access
- **Real-time Status** - Live bot and service monitoring

### Welcome Messages
- **Custom Messages** - Rich text with variables
- **Embed Support** - Beautiful welcome embeds
- **Auto-Role Assignment** - Assign roles to new members
- **Direct Messages** - Send welcome via DM
- **Preview System** - Test messages before deployment

### Role Commands
- **Slash Commands** - Create custom `/role` commands
- **Multiple Actions** - Add, remove, or toggle roles
- **Cooldowns** - Prevent command spam
- **Custom Responses** - Personalized feedback
- **Usage Tracking** - Monitor command statistics

### Giveaway Management
- **Create Giveaways** - Full giveaway creation interface
- **Prize Management** - Support for various prize types
- **Duration Control** - Flexible time settings
- **Winner Selection** - Configurable number of winners
- **Host Assignment** - Assign specific users as hosts
- **Real-time Monitoring** - Track entries and participation
- **Winner Notifications** - Automatic DM notifications

### Fissure Notifications
- **Mission Type Filtering** - Notify for specific Warframe missions
- **Node-Specific Alerts** - Target specific nodes
- **Steel Path Support** - Separate Steel Path notifications
- **Role Pings** - Mention roles when notifications are sent
- **Channel Management** - Configure notification channels

### Analytics & Monitoring
- **Command Usage** - Track most used commands
- **User Activity** - Monitor user engagement
- **Server Growth** - Track member count trends
- **Feature Usage** - Monitor bot feature usage
- **Performance Metrics** - Bot response times and uptime
- **Interactive Charts** - Visual data representation

### Logs & Monitoring
- **Real-time Logs** - Live server and bot activity
- **Log Filtering** - Filter by level, search, and time
- **Auto-refresh** - Automatic log updates
- **Export Functionality** - Download logs for analysis
- **Color-coded Display** - Easy log level identification

### Moderation Tools
- **User Management** - View and manage server members
- **Warning System** - Issue and track user warnings
- **Action History** - Complete moderation logs
- **Role Management** - Assign and remove user roles
- **Kick/Ban Actions** - Moderate user behavior
- **Search & Filter** - Find users quickly

## 🛠️ Development

### Project Structure
```
WardenPrime/
├── src/                    # Bot source code
├── dashboard/              # Enhanced dashboard
│   ├── src/
│   │   ├── enhanced-server.ts  # Main dashboard server
│   │   └── server.ts           # Original server
│   ├── views/              # Dashboard templates
│   └── public/              # Static assets
├── docker-compose.dev-hybrid.yml  # Docker services
├── start-dev-hybrid.sh     # Linux/macOS launcher
├── start-dev-hybrid.bat    # Windows launcher
└── .env                    # Environment configuration
```

### Making Changes
1. **Bot Code** - Edit files in `src/`, restart bot with Ctrl+C and run script again
2. **Dashboard Code** - Edit files in `dashboard/`, rebuild with `docker-compose -f docker-compose.dev-hybrid.yml up -d --build dashboard`
3. **Database** - Use `docker exec -it wardenprime-postgres-dev psql -U wardenprime -d wardenprime`

### Useful Commands
```bash
# Stop everything
./stop-dev-hybrid.sh

# Restart just the dashboard
docker-compose -f docker-compose.dev-hybrid.yml restart dashboard

# View dashboard logs
docker-compose -f docker-compose.dev-hybrid.yml logs dashboard

# View database logs
docker-compose -f docker-compose.dev-hybrid.yml logs postgres

# Access database directly
docker exec -it wardenprime-postgres-dev psql -U wardenprime -d wardenprime
```

## 🔒 Security

### Authentication
- **Discord OAuth** - Secure authentication via Discord
- **Permission Checks** - Server administrator verification
- **Session Management** - Encrypted session storage

### Data Protection
- **Input Validation** - All user inputs validated
- **SQL Injection Prevention** - Parameterized queries
- **XSS Protection** - Output encoding and sanitization
- **CSRF Protection** - Cross-site request forgery prevention

## 🐛 Troubleshooting

### Common Issues

**Dashboard not accessible:**
```bash
# Check if dashboard is running
docker ps | grep dashboard

# Restart dashboard
docker-compose -f docker-compose.dev-hybrid.yml restart dashboard
```

**Database connection issues:**
```bash
# Check database status
docker ps | grep postgres

# Check database logs
docker-compose -f docker-compose.dev-hybrid.yml logs postgres
```

**Bot not connecting:**
- Check `.env` file has correct `DISCORD_TOKEN`
- Verify database credentials in `.env`
- Check bot logs in `logs/` directory

**OAuth not working:**
- Verify `CLIENT_ID` and `DISCORD_CLIENT_SECRET` in `.env`
- Check redirect URI in Discord Developer Portal
- Set `OAUTH_DISABLED=false` in `.env`

### Logs
- **Bot Logs**: Check `logs/` directory
- **Dashboard Logs**: `docker-compose -f docker-compose.dev-hybrid.yml logs dashboard`
- **Database Logs**: `docker-compose -f docker-compose.dev-hybrid.yml logs postgres`

## 📚 Additional Resources

- **Discord Developer Portal**: https://discord.com/developers/applications
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Docker Documentation**: https://docs.docker.com/
- **Node.js Documentation**: https://nodejs.org/docs/

## 🤝 Support

For issues and questions:
1. Check this documentation
2. Review error logs
3. Check GitHub issues
4. Contact the development team

---

**WardenPrime Enhanced Hybrid Development** - Everything you need in one command! 🚀
