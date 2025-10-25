#!/bin/bash

# WardenPrime Hybrid Development Stopper (Linux/macOS)
# Stops Docker services (database and dashboard)

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

print_header "🛑 Stopping WardenPrime Hybrid Development Environment"
echo ""

# Stop Docker services
print_info "Stopping Docker services..."
docker-compose -f docker-compose.dev-hybrid.yml down

print_status "Docker services stopped"

# Ask if user wants to clean up volumes
echo ""
read -p "Do you want to remove database data? (y/N): " cleanup
if [[ $cleanup =~ ^[Yy]$ ]]; then
    print_info "Removing database volumes..."
    docker-compose -f docker-compose.dev-hybrid.yml down -v
    print_status "Database data removed"
else
    print_info "Database data preserved"
fi

print_status "Hybrid development environment stopped"
echo ""
print_header "📋 Next Steps:"
echo "  Start again: ./start-dev-hybrid.sh"
echo "  Full cleanup: ./stop-dev-hybrid.sh (and choose 'y' for cleanup)"
