# Warden Prime Dashboard

Web-based control panel for the Warden Prime Discord bot.

## Features

- **Bot Control**: Real-time bot status, service management, and configuration
- **World State**: Live Warframe game data display
- **Warframes Management**: CRUD operations for warframe catalog
- **Authentication**: Discord OAuth2 integration for admin access
- **API Integration**: Communicates with bot via HTTP API

## Structure

```
dashboard/
├── src/
│   └── server.ts          # Express server and routes
├── views/                 # EJS templates
│   ├── home.ejs
│   ├── dashboard/
│   │   └── bot-control.ejs
│   └── warframes/
│       ├── list.ejs
│       └── edit.ejs
├── public/                # Static assets (CSS, JS, images)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

- `DASHBOARD_ENABLED`: Enable/disable dashboard
- `DASHBOARD_PORT`: Port for dashboard server (default: 3080)
- `DASHBOARD_SESSION_SECRET`: Session secret for authentication
- `OAUTH_DISABLED`: Disable OAuth for development
- `CLIENT_ID`: Discord bot client ID
- `DISCORD_CLIENT_SECRET`: Discord OAuth client secret

## API Communication

The dashboard communicates with the bot via HTTP API on port 3081:

- `GET /api/bot/status` - Bot status and metrics
- `POST /api/bot/services/toggle` - Toggle bot services
- `POST /api/bot/dictionary/update` - Update game dictionaries
- `GET /api/bot/guilds` - Get bot's guilds
- `GET /api/bot/notifications` - Get notification settings
- `POST /api/bot/notifications` - Update notification settings
- `GET /api/bot/warframes` - Get warframe catalog
- `POST /api/bot/warframes` - Create warframe entry
