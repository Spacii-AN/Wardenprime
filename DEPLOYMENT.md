# WardenPrime Deployment Guide

This guide covers deployment options for WardenPrime: Docker for development/testing and native Debian for production.

## 🐳 Docker Deployment (Development/Testing)

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for building)
- Git

### Quick Start
```bash
# Clone the repository
git clone <repository-url>
cd WardenPrime

# Copy environment template
cp env.template .env

# Edit your .env file with your Discord bot credentials
nano .env

# Start development environment
docker-compose -f docker-compose.dev-hybrid.yml up --build
```

### Development Workflow
```bash
# Start services (database + dashboard)
docker-compose -f docker-compose.dev-hybrid.yml up -d

# Run bot locally (for development)
npm run dev

# Stop services
docker-compose -f docker-compose.dev-hybrid.yml down
```

### Environment Configuration
```env
# Database (uses local Docker)
DATABASE_TYPE=postgres
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=wardenprime
PG_USER=wardenprime
PG_PASSWORD=wardenprime_password
PG_SSL_MODE=disable

# Discord Configuration
BOT_TOKEN=your_bot_token
CLIENT_ID=your_client_id
TEST_GUILD_ID=your_test_guild_id

# Development settings
NODE_ENV=development
COMMAND_DEPLOYMENT_MODE=guild
```

---

## 🐧 Native Debian Deployment (Production)

### Prerequisites
- Debian 11+ (or Ubuntu 20.04+)
- Node.js 18+
- PostgreSQL 15+
- PM2 (for process management)
- Nginx (for reverse proxy, optional)

### System Setup

#### 1. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install PM2 globally
sudo npm install -g pm2

# Install build tools
sudo apt install build-essential python3 -y
```

#### 2. Database Setup
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE wardenprime;
CREATE USER wardenprime WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE wardenprime TO wardenprime;
\q
```

#### 3. Application Setup
```bash
# Create application directory
sudo mkdir -p /opt/wardenprime
sudo chown $USER:$USER /opt/wardenprime
cd /opt/wardenprime

# Clone repository
git clone <repository-url> .

# Install dependencies
npm install

# Build the application
npm run build
```

#### 4. Environment Configuration
```bash
# Create production environment file
nano .env
```

```env
# Production Environment
NODE_ENV=production
DATABASE_TYPE=postgres

# Database Configuration (Native PostgreSQL)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=wardenprime
PG_USER=wardenprime
PG_PASSWORD=your_secure_password
PG_SSL_MODE=disable

# Discord Configuration
BOT_TOKEN=your_production_bot_token
CLIENT_ID=your_production_client_id
BOT_OWNER_ID=your_discord_user_id

# Production Settings
COMMAND_DEPLOYMENT_MODE=global
LOG_LEVEL=INFO
ENABLE_LOGGING=true

# Dashboard Configuration (Optional)
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3080
DASHBOARD_SESSION_SECRET=your_secure_session_secret
DASHBOARD_PUBLIC_URL=https://yourdomain.com
```

#### 5. PM2 Configuration
```bash
# Create PM2 ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'wardenprime-bot',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

#### 6. Start Application
```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

### Database Migrations

The application automatically creates all necessary tables on startup. For manual migrations:

```bash
# Run specific migrations
npm run migrate:embeds
npm run migrate:permissions
```

### Monitoring and Maintenance

#### PM2 Commands
```bash
# View logs
pm2 logs wardenprime-bot

# Monitor resources
pm2 monit

# Restart application
pm2 restart wardenprime-bot

# Stop application
pm2 stop wardenprime-bot

# View status
pm2 status
```

#### Database Maintenance
```bash
# Connect to database
sudo -u postgres psql -d wardenprime

# Check table status
\dt

# Backup database
pg_dump -U wardenprime -h localhost wardenprime > backup.sql

# Restore database
psql -U wardenprime -h localhost wardenprime < backup.sql
```

---

## 🔄 Migration from Docker to Native

### Step 1: Export Data from Docker
```bash
# Export database from Docker container
docker exec wardenprime-postgres-dev pg_dump -U wardenprime wardenprime > wardenprime_backup.sql
```

### Step 2: Import to Native PostgreSQL
```bash
# Import to native PostgreSQL
psql -U wardenprime -h localhost wardenprime < wardenprime_backup.sql
```

### Step 3: Update Configuration
```bash
# Update .env file for native deployment
nano .env
```

### Step 4: Test and Deploy
```bash
# Test the application
npm start

# If successful, deploy with PM2
pm2 start ecosystem.config.js
```

---

## 🌐 Nginx Reverse Proxy (Optional)

### Install Nginx
```bash
sudo apt install nginx -y
```

### Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/wardenprime
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/wardenprime /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 Security Considerations

### Firewall Setup
```bash
# Install UFW
sudo apt install ufw -y

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Database Security
```bash
# Secure PostgreSQL
sudo nano /etc/postgresql/15/main/postgresql.conf
# Set: listen_addresses = 'localhost'

sudo nano /etc/postgresql/15/main/pg_hba.conf
# Ensure: local all all peer
```

### Application Security
- Use strong passwords
- Keep dependencies updated
- Monitor logs regularly
- Use HTTPS in production
- Restrict database access

---

## 📊 Monitoring

### System Monitoring
```bash
# Install monitoring tools
sudo apt install htop iotop nethogs -y

# Monitor system resources
htop
iotop
nethogs
```

### Application Monitoring
```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs wardenprime-bot --lines 100

# Check application status
pm2 status
```

### Database Monitoring
```bash
# Connect and check
sudo -u postgres psql -d wardenprime -c "SELECT * FROM pg_stat_activity;"
```

---

## 🚀 Production Checklist

- [ ] System updated and secured
- [ ] PostgreSQL installed and configured
- [ ] Application built and tested
- [ ] Environment variables configured
- [ ] PM2 configured and running
- [ ] Database migrations completed
- [ ] Firewall configured
- [ ] Nginx configured (if using)
- [ ] SSL certificates installed (if using HTTPS)
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Log rotation configured

---

## 🔧 Troubleshooting

### Common Issues

#### Bot Not Starting
```bash
# Check logs
pm2 logs wardenprime-bot

# Check environment
cat .env

# Test database connection
npm run dbtest
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -U wardenprime -h localhost wardenprime
```

#### Permission Issues
```bash
# Fix file permissions
sudo chown -R $USER:$USER /opt/wardenprime
chmod +x ecosystem.config.js
```

### Log Locations
- Application logs: `/opt/wardenprime/logs/`
- PM2 logs: `~/.pm2/logs/`
- System logs: `/var/log/syslog`
- Nginx logs: `/var/log/nginx/`

---

## 📝 Maintenance

### Regular Tasks
- Monitor application logs
- Check system resources
- Update dependencies
- Backup database
- Review security logs

### Updates
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild application
npm run build

# Restart with PM2
pm2 restart wardenprime-bot
```

This deployment guide provides everything needed for both development (Docker) and production (native Debian) deployments of WardenPrime.
