# WardenPrime Enhanced Admin Dashboard

A comprehensive Discord bot administration dashboard with Discord OAuth authentication and full server management capabilities.

## 🚀 Features

### 🔐 Authentication & Security
- **Discord OAuth Integration** - Secure login with Discord accounts
- **Permission-based Access** - Only administrators can access server management
- **Session Management** - Secure session handling with configurable secrets

### 🎛️ Server Management
- **Multi-Server Support** - Manage multiple Discord servers from one dashboard
- **Server Selection** - Easy switching between different servers
- **Real-time Status** - Live bot status and connection monitoring

### 👋 Welcome Messages
- **Custom Welcome Messages** - Rich text and embed support
- **Variable Support** - Dynamic content with user/server variables
- **Auto-Role Assignment** - Automatically assign roles to new members
- **Direct Message Support** - Send welcome messages via DM
- **Image Support** - Custom welcome images and embeds
- **Preview System** - Test messages before deployment

### 🎭 Role Commands
- **Slash Command Management** - Create custom role assignment commands
- **Multiple Action Types** - Add, remove, or toggle roles
- **Cooldown System** - Prevent command spam with configurable cooldowns
- **Custom Responses** - Personalized command feedback
- **Ephemeral Responses** - Private command responses
- **Usage Tracking** - Monitor command usage statistics

### 🎁 Giveaway Management
- **Create Giveaways** - Full giveaway creation interface
- **Prize Management** - Support for various prize types
- **Duration Control** - Flexible time settings (hours to weeks)
- **Winner Selection** - Configurable number of winners
- **Requirements** - Set entry requirements and restrictions
- **Host Assignment** - Assign specific users as giveaway hosts
- **Real-time Monitoring** - Track entries and participation
- **Manual Control** - End giveaways early or reroll winners
- **Winner Notifications** - Automatic DM notifications to winners

### 🔔 Fissure Notifications
- **Mission Type Filtering** - Notify for specific Warframe mission types
- **Node-Specific Alerts** - Target specific nodes for notifications
- **Steel Path Support** - Separate notifications for Steel Path missions
- **Role Pings** - Mention specific roles when notifications are sent
- **Channel Management** - Configure notification channels
- **Real-time Updates** - Live fissure status monitoring

### 📊 Analytics & Monitoring
- **Command Usage Statistics** - Track most used commands
- **User Activity** - Monitor user engagement and activity
- **Server Growth** - Track member count and growth trends
- **Feature Usage** - Monitor usage of different bot features
- **Performance Metrics** - Bot response times and uptime
- **Interactive Charts** - Visual representation of data with Chart.js

### 📝 Logs & Monitoring
- **Real-time Logs** - Live server and bot activity logs
- **Log Filtering** - Filter by log level, search terms, and time ranges
- **Auto-refresh** - Automatic log updates
- **Export Functionality** - Download logs for analysis
- **Log Statistics** - Count of different log types
- **Color-coded Display** - Easy identification of log levels

### 🛡️ Moderation Tools
- **User Management** - View and manage server members
- **Warning System** - Issue and track user warnings
- **Action History** - Complete moderation action logs
- **Role Management** - Assign and remove user roles
- **Kick/Ban Actions** - Moderate user behavior
- **Search & Filter** - Find users quickly
- **User Details** - Comprehensive user information display

## 🏗️ Architecture

### Backend (Node.js + TypeScript)
- **Express.js** - Web server framework
- **Passport.js** - Authentication middleware
- **PostgreSQL** - Database integration
- **Session Management** - Secure user sessions
- **API Integration** - Bot API communication

### Frontend (Bootstrap + EJS)
- **Bootstrap 5** - Responsive UI framework
- **Font Awesome** - Icon library
- **Chart.js** - Data visualization
- **EJS Templates** - Server-side rendering
- **AJAX** - Dynamic content loading

### Database Integration
- **PostgreSQL** - Primary database
- **Connection Pooling** - Efficient database connections
- **Real-time Queries** - Live data updates
- **Data Validation** - Input sanitization

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Discord Bot Token
- Discord OAuth Application

### Installation

1. **Install Dependencies**
   ```bash
   cd dashboard
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Create .env file
   DASHBOARD_ENABLED=true
   DASHBOARD_PORT=3080
   DASHBOARD_SESSION_SECRET=your-secret-key
   DASHBOARD_PUBLIC_URL=http://localhost:3080
   
   # Discord OAuth
   CLIENT_ID=your-discord-client-id
   DISCORD_CLIENT_SECRET=your-discord-client-secret
   OAUTH_CALLBACK_URL=http://localhost:3080/auth/callback
   
   # Database
   PG_HOST=localhost
   PG_PORT=5432
   PG_DATABASE=wardenprime
   PG_USER=wardenprime
   PG_PASSWORD=wardenprime_password
   PG_SSL_MODE=disable
   
   # Bot API
   BOT_API_URL=http://localhost:3081
   BOT_API_KEY=your-api-key
   ```

3. **Start the Dashboard**
   ```bash
   npm start
   ```

### Discord OAuth Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application
   - Note Client ID and Client Secret

2. **Configure OAuth**
   - Add redirect URI: `http://localhost:3080/auth/callback`
   - Enable OAuth2 scopes: `identify`, `guilds`
   - Save changes

## 📱 Usage

### Accessing the Dashboard
1. Navigate to `http://localhost:3080`
2. Click "Login with Discord"
3. Authorize the application
4. Select a server to manage

### Server Management
- **Dashboard Overview** - Server statistics and quick actions
- **Welcome Messages** - Configure member welcome system
- **Role Commands** - Create custom role assignment commands
- **Giveaways** - Manage server giveaways
- **Fissure Notifications** - Set up Warframe notifications
- **Analytics** - View server statistics and usage
- **Logs** - Monitor bot activity and errors
- **Moderation** - User management and moderation tools

## 🔧 Configuration

### Server Settings
- **Welcome Messages** - Enable/disable, configure channels, set messages
- **Role Commands** - Create, edit, and manage role assignment commands
- **Notifications** - Configure various notification types
- **Permissions** - Set up role-based access control

### Bot Integration
- **API Communication** - Real-time bot status and control
- **Command Management** - Deploy and manage slash commands
- **Service Control** - Enable/disable bot services
- **Data Synchronization** - Keep dashboard and bot data in sync

## 🛠️ Development

### Project Structure
```
dashboard/
├── src/
│   ├── enhanced-server.ts    # Main server file
│   └── server.ts            # Original server file
├── views/
│   ├── dashboard/           # Main dashboard views
│   ├── servers/             # Server management views
│   └── embeds/              # Embed configuration views
├── public/                  # Static assets
└── package.json             # Dependencies and scripts
```

### Adding New Features
1. **Backend Routes** - Add new API endpoints in `enhanced-server.ts`
2. **Frontend Views** - Create EJS templates in `views/`
3. **Database Integration** - Add database queries and operations
4. **Bot API** - Extend bot API client for new functionality

### Database Schema
The dashboard integrates with the existing WardenPrime database:
- `giveaways` - Giveaway management
- `fissure_notifications` - Fissure notification settings
- `embed_settings` - Embed customization
- `lfg_sessions` - Looking for group sessions
- Additional tables for analytics and logging

## 🔒 Security

### Authentication
- **Discord OAuth** - Secure authentication via Discord
- **Session Management** - Encrypted session storage
- **Permission Checks** - Server administrator verification
- **CSRF Protection** - Cross-site request forgery prevention

### Data Protection
- **Input Validation** - All user inputs are validated
- **SQL Injection Prevention** - Parameterized queries
- **XSS Protection** - Output encoding and sanitization
- **Secure Headers** - Security headers for all responses

## 📈 Performance

### Optimization
- **Connection Pooling** - Efficient database connections
- **Caching** - Strategic data caching
- **Lazy Loading** - On-demand content loading
- **Compression** - Gzip compression for static assets

### Monitoring
- **Real-time Logs** - Live activity monitoring
- **Performance Metrics** - Response time tracking
- **Error Tracking** - Comprehensive error logging
- **Usage Analytics** - Feature usage statistics

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

### Code Standards
- **TypeScript** - Strict type checking
- **ESLint** - Code quality enforcement
- **Prettier** - Code formatting
- **Comments** - Comprehensive documentation

## 📄 License

This project is part of the WardenPrime Discord Bot ecosystem.

## 🆘 Support

For support and questions:
- Check the documentation
- Review the code comments
- Open an issue on GitHub
- Contact the development team

---

**WardenPrime Enhanced Dashboard** - Comprehensive Discord bot administration made simple.
