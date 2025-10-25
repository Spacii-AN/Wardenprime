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
    echo 1) Individual Development (recommended)
    echo 2) Shared Development
    echo 3) Manual setup
    echo.
    set /p choice="Enter your choice (1-3): "
    
    if "!choice!"=="1" (
        echo ℹ️  Running individual development setup...
        call setup-dev.bat
    ) else if "!choice!"=="2" (
        echo ℹ️  Running shared development setup...
        call setup-dev-shared.bat
    ) else if "!choice!"=="3" (
        echo ℹ️  Please create .env file manually from env.template
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

REM Start Docker services (database and dashboard)
echo ℹ️  Starting Docker services (database and dashboard)...
docker-compose -f docker-compose.dev-hybrid.yml up -d

REM Wait for database to be ready
echo ℹ️  Waiting for database to be ready...
timeout /t 10 /nobreak >nul

REM Run embed settings migration
echo ℹ️  Running embed settings migration...
npm run migrate:embeds
echo ✅ Migration completed

REM Start the bot locally
echo ℹ️  Starting WardenPrime bot locally...
echo.
echo ✅ WardenPrime hybrid development environment is running!
echo.
echo 🔗 Access Points:
echo   Bot:         Running locally (no port)
echo   Database:    localhost:5432
echo   Dashboard:   http://localhost:3080
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
