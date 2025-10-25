@echo off
REM WardenPrime Windows Development Setup
REM This script helps set up the development environment on Windows

setlocal enabledelayedexpansion

echo.
echo 🚀 WardenPrime Windows Development Setup
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this script from the WardenPrime root directory
    pause
    exit /b 1
)

echo ℹ️  Setting up development environment...

REM Check if .env exists
if not exist ".env" (
    echo ℹ️  Creating .env file from template...
    if exist "env.template" (
        copy "env.template" ".env"
        echo ✅ .env file created from template
        echo.
        echo ⚠️  IMPORTANT: Please edit .env file with your Discord bot token and other settings
        echo    - Open .env in a text editor
        echo    - Add your Discord bot token to DISCORD_TOKEN
        echo    - Update other settings as needed
        echo.
        pause
    ) else (
        echo ❌ env.template not found!
        pause
        exit /b 1
    )
) else (
    echo ✅ .env file already exists
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or later.
    echo    Download from: https://nodejs.org/
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

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop.
    echo    Download from: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo ✅ Docker is installed

REM Install dependencies
echo ℹ️  Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed

REM Create necessary directories
echo ℹ️  Creating directories...
if not exist "logs" mkdir logs
if not exist "data" mkdir data
echo ✅ Directories created

echo.
echo ✅ Setup complete!
echo.
echo 📋 Next steps:
echo 1. Edit .env file with your Discord bot token
echo 2. Run start-dev-hybrid.bat to start the development environment
echo.
pause
