@echo off
REM WardenPrime Hybrid Development Launcher (Windows)
REM Bot runs locally, database and dashboard run in containers

setlocal enabledelayedexpansion

echo.
echo 🚀 Starting WardenPrime Hybrid Development Environment
echo Bot: Local ^| Database: Docker ^| Dashboard: Docker
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this script from the WardenPrime root directory
    pause
    exit /b 1
)

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  .env file not found!
    echo.
    echo Choose your setup option:
    echo 1) Run setup script (recommended)
    echo 2) Manual setup
    echo.
    set /p choice="Enter your choice (1-2): "
    
    if "!choice!"=="1" (
        echo ℹ️  Running Windows setup script...
        call setup-dev-windows.bat
        if %errorlevel% neq 0 (
            echo ❌ Setup failed
            pause
            exit /b 1
        )
    ) else if "!choice!"=="2" (
        echo ℹ️  Please create .env file manually from env.template
        echo 1. Copy env.template to .env
        echo 2. Edit .env with your Discord bot token and other settings
        echo 3. Run this script again
        pause
        exit /b 1
    ) else (
        echo ❌ Invalid choice
        pause
        exit /b 1
    )
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or later.
    pause
    exit /b 1
)

echo ✅ Node.js is installed

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm.
    pause
    exit /b 1
)

echo ✅ npm is installed

REM Check Docker status
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker.
    pause
    exit /b 1
)

echo ✅ Docker is running

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo ℹ️  Installing dependencies...
    npm install
    echo ✅ Dependencies installed
) else (
    echo ℹ️  Dependencies already installed
)

REM Create necessary directories
echo ℹ️  Creating directories...
if not exist "logs" mkdir logs
if not exist "data" mkdir data
echo ✅ Directories created

REM Build the project
echo ℹ️  Building TypeScript project...
npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed
    pause
    exit /b 1
)
echo ✅ Project built successfully

REM Start Docker services (database and enhanced dashboard)
echo ℹ️  Starting Docker services (database and enhanced dashboard)...
docker-compose -f docker-compose.dev-hybrid.yml up -d
if %errorlevel% neq 0 (
    echo ❌ Failed to start Docker services
    pause
    exit /b 1
)

REM Wait for database to be ready
echo ℹ️  Waiting for database to be ready...
timeout /t 10 /nobreak >nul

REM Set environment variables for local bot to connect to localhost database
echo ℹ️  Setting up database connection...
REM Use values from .env file if they exist, otherwise use defaults
if defined PG_HOST (
    echo Using PG_HOST from .env: %PG_HOST%
) else (
    set PG_HOST=localhost
)
if defined PG_PORT (
    echo Using PG_PORT from .env: %PG_PORT%
) else (
    set PG_PORT=5432
)
if defined PG_DATABASE (
    echo Using PG_DATABASE from .env: %PG_DATABASE%
) else (
    set PG_DATABASE=wardenprime
)
if defined PG_USER (
    echo Using PG_USER from .env: %PG_USER%
) else (
    set PG_USER=wardenprime
)
if defined PG_PASSWORD (
    echo Using PG_PASSWORD from .env
) else (
    set PG_PASSWORD=wardenprime_password
)

REM Run embed settings migration (optional - can be skipped if it fails)
echo ℹ️  Running embed settings migration...
npm run migrate:embeds
if %errorlevel% neq 0 (
    echo ⚠️  Migration failed, but continuing with bot startup...
) else (
    echo ✅ Migration completed
)

REM Start the bot locally
echo ℹ️  Starting WardenPrime bot locally...
echo.
echo ✅ WardenPrime hybrid development environment is running!
echo.
echo 🔗 Access Points:
echo   Bot:         Running locally (no port)
echo   Database:    localhost:5432
echo   Dashboard:   http://localhost:3080 (Enhanced Admin Dashboard)
echo   Bot API:     http://localhost:3081 (if enabled)
echo.
echo 📋 Useful Commands:
echo   Stop bot:     Ctrl+C
echo   Stop services: stop-dev-hybrid.bat
echo   View logs:     Check logs/ directory
echo   Restart:      Run this script again
echo.

REM Start the bot in development mode
set NODE_ENV=development
npm run dev
