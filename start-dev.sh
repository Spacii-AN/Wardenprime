#!/bin/bash

# WardenPrime Development Launcher (Linux/macOS)
# This script starts all development services and provides easy management

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

print_header "🚀 Starting WardenPrime Development Environment"
echo ""

# Check if Docker is running
print_info "Checking Docker status..."
if ! docker version >/dev/null 2>&1; then
    print_error "Docker is not running or not installed"
    print_info "Please start Docker Desktop and try again"
    exit 1
fi
print_status "Docker is running"

# Create necessary directories
print_info "Creating directories..."
mkdir -p logs data
print_status "Directories created"

# Check if services are already running
if docker-compose ps | grep -q "Up"; then
    print_warning "Some services are already running"
    echo ""
    echo "What would you like to do?"
    echo "1) Restart all services"
    echo "2) Stop all services"
    echo "3) Continue with current services"
    echo ""
    read -p "Enter your choice (1-3): " action
    
    case $action in
        1)
            print_info "Stopping existing services..."
            docker-compose down
            print_info "Starting services..."
            docker-compose up -d
            ;;
        2)
            print_info "Stopping all services..."
            docker-compose down
            print_status "All services stopped"
            exit 0
            ;;
        3)
            print_info "Continuing with existing services..."
            ;;
    esac
else
    # Start services
    print_info "Building and starting services..."
    docker-compose build
    docker-compose up -d
fi

# Wait for services to be ready
print_info "Waiting for services to be ready..."
sleep 10

# Check service status
print_header "📊 Service Status:"
docker-compose ps

echo ""
print_status "WardenPrime development environment is running!"
echo ""
print_header "🔗 Access Points:"
echo "  Dashboard: http://localhost:3080"
echo "  Bot API: http://localhost:3081"
echo "  Database: localhost:5432"
echo ""
print_header "📋 Useful Commands:"
echo "  View logs:     docker-compose logs -f"
echo "  Stop services: ./stop-dev.sh"
echo "  Restart:       docker-compose restart"
echo "  Bot logs:      docker-compose logs -f bot"
echo "  DB logs:       docker-compose logs -f postgres"
echo ""

# Ask if user wants to view logs
read -p "Would you like to view the bot logs now? (y/n): " viewLogs
if [[ $viewLogs =~ ^[Yy]$ ]]; then
    print_info "Showing bot logs (Press Ctrl+C to exit):"
    docker-compose logs -f bot
fi

print_status "Development environment ready!"
