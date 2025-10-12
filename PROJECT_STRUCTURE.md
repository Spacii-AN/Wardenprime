# Warden Prime Project Structure

## 📁 **Complete File Organization**

```
WardenPrime/
├── 📁 src/                          # Bot source code
│   ├── 📁 api/                      # Bot API server
│   │   └── botAPI.ts               # HTTP API endpoints for dashboard
│   ├── 📁 commands/                 # Discord slash commands
│   │   ├── admin/                  # Admin commands
│   │   ├── config/                 # Configuration commands
│   │   ├── info/                   # Information commands
│   │   ├── moderation/             # Moderation commands
│   │   └── utility/                # Utility commands
│   ├── 📁 config/                  # Configuration
│   │   └── config.ts              # Main config with env vars
│   ├── 📁 data/                     # Static data files
│   ├── 📁 events/                   # Discord event handlers
│   ├── 📁 services/                 # Background services
│   │   ├── migrations/             # Database migrations
│   │   ├── arbitrationService.ts   # Arbitration tracking
│   │   ├── ayaService.ts           # Aya alerts
│   │   ├── baroService.ts          # Baro Ki'Teer tracking
│   │   ├── dictionaryUpdater.ts    # Game data updates
│   │   ├── fissureService.ts       # Void fissures
│   │   ├── incarnonService.ts      # Incarnon Genesis
│   │   ├── lfgService.ts           # Looking For Group
│   │   ├── permissionService.ts    # Role permissions
│   │   └── postgresDatabase.ts     # Database operations
│   ├── 📁 scripts/                  # Utility scripts
│   ├── 📁 types/                    # TypeScript definitions
│   ├── 📁 utils/                    # Utility functions
│   └── index.ts                    # Main bot entry point
│
├── 📁 dashboard/                    # 🆕 Separate dashboard project
│   ├── 📁 src/
│   │   └── server.ts               # Dashboard Express server
│   ├── 📁 views/                   # EJS templates
│   │   ├── home.ejs               # Landing page
│   │   ├── dashboard/
│   │   │   └── bot-control.ejs    # Bot control panel
│   │   └── warframes/
│   │       ├── list.ejs           # Warframes list
│   │       └── edit.ejs           # Warframe editor
│   ├── 📁 public/                  # Static assets
│   │   └── style.css              # Dashboard styles
│   ├── package.json               # Dashboard dependencies
│   ├── tsconfig.json              # Dashboard TypeScript config
│   └── README.md                  # Dashboard documentation
│
├── 📁 dict/                        # Game data dictionaries
├── 📁 assets/                      # Bot assets (images, fonts)
├── 📁 data/                        # JSON database files
├── 📁 logs/                        # Bot log files
├── 📁 node_modules/                # Dependencies
├── package.json                    # Main project dependencies
├── tsconfig.json                   # Main TypeScript config
├── ecosystem.config.js             # PM2 configuration
└── README.md                       # Project documentation
```

## 🔄 **Architecture Overview**

```
┌─────────────────┐    HTTP API     ┌─────────────────┐
│   Dashboard     │ ←─────────────→ │   Bot Server    │
│   (Port 3080)   │                  │   (Port 3081)   │
│                 │                  │                 │
│ - Web UI        │                  │ - Discord.js    │
│ - Auth          │                  │ - Services      │
│ - API Client    │                  │ - Database      │
└─────────────────┘                  └─────────────────┘
```

## ✅ **Key Benefits of This Organization**

1. **Separation of Concerns**: Bot and dashboard are separate projects
2. **Independent Development**: Can work on dashboard without bot running
3. **Clean Dependencies**: Each project has its own package.json
4. **Scalable Deployment**: Dashboard can be deployed separately
5. **Maintainable**: Clear file structure and responsibilities
6. **Type Safety**: Proper TypeScript configuration for both projects

## 🚀 **Development Commands**

### Bot Development
```bash
npm run dev              # Start bot in development
npm run build            # Build bot
npm run deploy:commands  # Deploy slash commands
```

### Dashboard Development
```bash
npm run dev:dashboard    # Start dashboard only
cd dashboard && npm run dev  # Start dashboard from its folder
```

### Full Stack
```bash
npm start                # Start bot with dashboard
```

## 📋 **File Responsibilities**

- **`src/`**: Core bot functionality (Discord.js, commands, services)
- **`dashboard/`**: Web interface for bot management
- **`src/api/`**: HTTP API server for dashboard communication
- **`dict/`**: Warframe game data dictionaries
- **`assets/`**: Static assets (images, fonts)
- **`data/`**: JSON database fallback files
