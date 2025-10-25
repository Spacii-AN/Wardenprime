#!/bin/bash

# WardenPrime Hybrid Development Launcher (Linux/macOS)
# Bot runs locally, database and dashboard run in containers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${CYAN}$1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the WardenPrime root directory"
    exit 1
fi

print_header "🚀 Starting WardenPrime Hybrid Development Environment"
echo "Bot: Local | Database: Docker | Dashboard: Docker"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found!"
    echo ""
    echo "Choose your setup option:"
    echo "1) Individual Development (recommended)"
    echo "2) Shared Development"
    echo "3) Manual setup"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            print_info "Running individual development setup..."
            ./setup-dev.sh
            ;;
        2)
            print_info "Running shared development setup..."
            ./setup-dev-shared.sh
            ;;
        3)
            print_info "Please create .env file manually from env.template"
            exit 1
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18 or later."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or later is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js $(node -v) is installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm."
    exit 1
fi

print_status "npm $(npm -v) is installed"

# Check Docker status
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker."
    exit 1
fi

print_status "Docker is running"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
    print_status "Dependencies installed"
else
    print_info "Dependencies already installed"
fi

# Create necessary directories
print_info "Creating directories..."
mkdir -p logs data
print_status "Directories created"

# Build the project
print_info "Building TypeScript project..."
npm run build
print_status "Project built successfully"

# Start Docker services (database and dashboard)
print_info "Starting Docker services (database and dashboard)..."
docker-compose -f docker-compose.dev-hybrid.yml up -d

# Wait for database to be ready
print_info "Waiting for database to be ready..."
sleep 10

# Check if database is healthy
if docker ps --filter "name=wardenprime-postgres-dev" --filter "health=healthy" | grep -q wardenprime-postgres-dev; then
    print_status "Database is ready"
else
    print_warning "Database may not be fully ready yet, but continuing..."
fi

# Set environment variables for local bot to connect to localhost database
# Use the same credentials as in .env but with localhost instead of postgres
export PG_HOST=localhost
export PG_PORT=5432
# Keep the same database name, user, and password from .env
export PG_DATABASE=${PG_DATABASE:-wardenprime_dev_spacii}
export PG_USER=${PG_USER:-spacii}
export PG_PASSWORD=${PG_PASSWORD:-w3ldKewfUuZvLIr}

# Run embed settings migration (optional - can be skipped if it fails)
print_info "Running embed settings migration..."
if npm run migrate:embeds; then
    print_status "Migration completed"
else
    print_warning "Migration failed, but continuing with bot startup..."
fi

# Start the bot locally
print_info "Starting WardenPrime bot locally..."
echo ""
print_status "WardenPrime hybrid development environment is running!"
echo ""
print_header "🔗 Access Points:"
echo "  Bot:         Running locally (no port)"
echo "  Database:    localhost:5432"
echo "  Dashboard:   http://localhost:3080"
echo "  Bot API:     http://localhost:3081 (if enabled)"
echo ""
print_header "📋 Useful Commands:"
echo "  Stop bot:     Ctrl+C"
echo "  Stop services: ./stop-dev-hybrid.sh"
echo "  View logs:     Check logs/ directory"
echo "  Restart:      Run this script again"
echo ""

# Start the bot in development mode
NODE_ENV=development npm run dev
