#!/bin/bash

# WardenPrime Docker Startup Script
# This script helps you get started with Docker quickly

set -e

echo "🚀 WardenPrime Docker Setup"
echo "=========================="

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    if [ -f "env.template" ]; then
        cp env.template .env
        echo "✅ Created .env file from template"
        echo "⚠️  Please edit .env file with your Discord bot credentials before continuing"
        echo "   Required: BOT_TOKEN and CLIENT_ID"
        exit 1
    else
        echo "❌ env.template not found. Please create .env file manually."
        exit 1
    fi
fi

# Check if required environment variables are set
if ! grep -q "BOT_TOKEN=your_discord_bot_token_here" .env; then
    echo "✅ .env file exists and appears to be configured"
else
    echo "⚠️  Please configure your Discord bot credentials in .env file"
    echo "   Required: BOT_TOKEN and CLIENT_ID"
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs data

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ WardenPrime is starting up!"
echo ""
echo "📋 Useful commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""
echo "🔍 Check bot logs: docker-compose logs -f bot"
echo "🗄️  Check database: docker-compose logs -f postgres"
echo ""
echo "🌐 Dashboard (if enabled): http://localhost:3080"
