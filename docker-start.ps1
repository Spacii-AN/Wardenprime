# WardenPrime Docker Startup Script for Windows PowerShell
# This script helps you get started with Docker quickly on Windows

Write-Host ""
Write-Host "🚀 WardenPrime Docker Setup" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file from template..." -ForegroundColor Yellow
    if (Test-Path "env.template") {
        Copy-Item "env.template" ".env"
        Write-Host "✅ Created .env file from template" -ForegroundColor Green
        Write-Host "⚠️  Please edit .env file with your Discord bot credentials before continuing" -ForegroundColor Yellow
        Write-Host "   Required: BOT_TOKEN and CLIENT_ID" -ForegroundColor Yellow
        
        $openEditor = Read-Host "Would you like to open .env file for editing now? (y/n)"
        if ($openEditor -eq "y" -or $openEditor -eq "Y") {
            notepad .env
        }
        
        Write-Host ""
        Write-Host "Please configure your Discord bot credentials in the .env file and run this script again." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    } else {
        Write-Host "❌ env.template not found. Please create .env file manually." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check if required environment variables are set (basic check)
$envContent = Get-Content ".env" -Raw
if ($envContent -match "BOT_TOKEN=your_discord_bot_token_here") {
    Write-Host "⚠️  Please configure your Discord bot credentials in .env file" -ForegroundColor Yellow
    Write-Host "   Required: BOT_TOKEN and CLIENT_ID" -ForegroundColor Yellow
    
    $openEditor = Read-Host "Would you like to open .env file for editing now? (y/n)"
    if ($openEditor -eq "y" -or $openEditor -eq "Y") {
        notepad .env
    }
    
    Write-Host ""
    Write-Host "Please configure your Discord bot credentials in the .env file and run this script again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ .env file exists and appears to be configured" -ForegroundColor Green

# Create necessary directories
Write-Host "📁 Creating necessary directories..." -ForegroundColor Yellow
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Name "logs" | Out-Null }
if (-not (Test-Path "data")) { New-Item -ItemType Directory -Name "data" | Out-Null }

# Check if Docker is running
Write-Host "🔍 Checking Docker status..." -ForegroundColor Yellow
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running or not installed." -ForegroundColor Red
    Write-Host "   Please start Docker Desktop and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Build and start services
Write-Host "🔨 Building Docker images..." -ForegroundColor Yellow
try {
    docker-compose build
    Write-Host "✅ Docker images built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to build Docker images" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "🚀 Starting services..." -ForegroundColor Yellow
try {
    docker-compose up -d
    Write-Host "✅ Services started successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host "📊 Service Status:" -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "✅ WardenPrime is starting up!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Useful commands:" -ForegroundColor Cyan
Write-Host "   View logs:     docker-compose logs -f" -ForegroundColor White
Write-Host "   Stop services: docker-compose down" -ForegroundColor White
Write-Host "   Restart:       docker-compose restart" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Check bot logs: docker-compose logs -f bot" -ForegroundColor White
Write-Host "🗄️  Check database: docker-compose logs -f postgres" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Dashboard (if enabled): http://localhost:3080" -ForegroundColor White
Write-Host ""

# Ask if user wants to view logs
$viewLogs = Read-Host "Would you like to view the bot logs now? (y/n)"
if ($viewLogs -eq "y" -or $viewLogs -eq "Y") {
    Write-Host ""
    Write-Host "📋 Bot logs (Press Ctrl+C to exit):" -ForegroundColor Cyan
    docker-compose logs -f bot
}

Write-Host ""
Write-Host "Setup complete! Press Enter to exit..." -ForegroundColor Green
Read-Host
