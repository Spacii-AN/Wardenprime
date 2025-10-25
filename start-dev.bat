@echo off
REM WardenPrime Development Launcher (Windows)
REM This script starts all development services and provides easy management

setlocal enabledelayedexpansion

echo.
echo 🚀 Starting WardenPrime Development Environment
echo ==============================================
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

echo ℹ️  Checking Docker status...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running or not installed
    echo ℹ️  Please start Docker Desktop and try again
    pause
    exit /b 1
)
echo ✅ Docker is running

echo ℹ️  Creating directories...
if not exist "logs" mkdir logs
if not exist "data" mkdir data
echo ✅ Directories created

REM Check if services are already running
docker-compose ps | findstr "Up" >nul
if %errorlevel% equ 0 (
    echo ⚠️  Some services are already running
    echo.
    echo What would you like to do?
    echo 1) Restart all services
    echo 2) Stop all services
    echo 3) Continue with current services
    echo.
    set /p action="Enter your choice (1-3): "
    
    if "!action!"=="1" (
        echo ℹ️  Stopping existing services...
        docker-compose down
        echo ℹ️  Starting services...
        docker-compose up -d
    ) else if "!action!"=="2" (
        echo ℹ️  Stopping all services...
        docker-compose down
        echo ✅ All services stopped
        pause
        exit /b 0
    ) else if "!action!"=="3" (
        echo ℹ️  Continuing with existing services...
    ) else (
        echo ❌ Invalid choice
        pause
        exit /b 1
    )
) else (
    REM Start services
    echo ℹ️  Building and starting services...
    docker-compose build
    docker-compose up -d
)

REM Wait for services to be ready
echo ℹ️  Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check service status
echo.
echo 📊 Service Status:
docker-compose ps

echo.
echo ✅ WardenPrime development environment is running!
echo.
echo 🔗 Access Points:
echo   Dashboard: http://localhost:3080
echo   Bot API: http://localhost:3081
echo   Database: localhost:5432
echo.
echo 📋 Useful Commands:
echo   View logs:     docker-compose logs -f
echo   Stop services: stop-dev.bat
echo   Restart:       docker-compose restart
echo   Bot logs:      docker-compose logs -f bot
echo   DB logs:       docker-compose logs -f postgres
echo.

REM Ask if user wants to view logs
set /p viewLogs="Would you like to view the bot logs now? (y/n): "
if /i "!viewLogs!"=="y" (
    echo.
    echo ℹ️  Showing bot logs (Press Ctrl+C to exit):
    docker-compose logs -f bot
)

echo.
echo ✅ Development environment ready!
pause
