@echo off
REM WardenPrime Docker Startup Script for Windows
REM This script helps you get started with Docker quickly on Windows

echo.
echo 🚀 WardenPrime Docker Setup
echo ==========================
echo.

REM Check if .env exists
if not exist ".env" (
    echo 📝 Creating .env file from template...
    if exist "env.template" (
        copy env.template .env >nul
        echo ✅ Created .env file from template
        echo ⚠️  Please edit .env file with your Discord bot credentials before continuing
        echo    Required: BOT_TOKEN and CLIENT_ID
        echo.
        echo Press any key to open .env file for editing...
        pause >nul
        notepad .env
        echo.
        echo Please configure your Discord bot credentials in the .env file and run this script again.
        pause
        exit /b 1
    ) else (
        echo ❌ env.template not found. Please create .env file manually.
        pause
        exit /b 1
    )
)

REM Check if required environment variables are set (basic check)
findstr /C:"BOT_TOKEN=your_discord_bot_token_here" .env >nul
if %errorlevel% equ 0 (
    echo ⚠️  Please configure your Discord bot credentials in .env file
    echo    Required: BOT_TOKEN and CLIENT_ID
    echo.
    echo Press any key to open .env file for editing...
    pause >nul
    notepad .env
    echo.
    echo Please configure your Discord bot credentials in the .env file and run this script again.
    pause
    exit /b 1
)

echo ✅ .env file exists and appears to be configured

REM Create necessary directories
echo 📁 Creating necessary directories...
if not exist "logs" mkdir logs
if not exist "data" mkdir data

REM Check if Docker is running
echo 🔍 Checking Docker status...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running or not installed.
    echo    Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo ✅ Docker is running

REM Build and start services
echo 🔨 Building Docker images...
docker-compose build
if %errorlevel% neq 0 (
    echo ❌ Failed to build Docker images
    pause
    exit /b 1
)

echo 🚀 Starting services...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ❌ Failed to start services
    pause
    exit /b 1
)

echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check service status
echo 📊 Service Status:
docker-compose ps

echo.
echo ✅ WardenPrime is starting up!
echo.
echo 📋 Useful commands:
echo    View logs:     docker-compose logs -f
echo    Stop services: docker-compose down
echo    Restart:       docker-compose restart
echo.
echo 🔍 Check bot logs: docker-compose logs -f bot
echo 🗄️  Check database: docker-compose logs -f postgres
echo.
echo 🌐 Dashboard (if enabled): http://localhost:3080
echo.

REM Ask if user wants to view logs
set /p viewLogs="Would you like to view the bot logs now? (y/n): "
if /i "%viewLogs%"=="y" (
    echo.
    echo 📋 Bot logs (Press Ctrl+C to exit):
    docker-compose logs -f bot
)

echo.
echo Setup complete! Press any key to exit...
pause >nul
