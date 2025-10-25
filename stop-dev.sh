#!/bin/bash

# WardenPrime Development Stopper (Linux/macOS)
# This script stops all development services and cleans up

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

print_header "🛑 Stopping WardenPrime Development Environment"
echo ""

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    print_warning "No services are currently running"
    exit 0
fi

print_info "Current running services:"
docker-compose ps

echo ""
echo "What would you like to do?"
echo "1) Stop all services (keep data)"
echo "2) Stop all services and remove volumes (WARNING: deletes database data)"
echo "3) Just show status"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        print_info "Stopping all services..."
        docker-compose down
        print_status "All services stopped (data preserved)"
        ;;
    2)
        print_warning "This will delete all database data!"
        read -p "Are you sure? Type 'yes' to confirm: " confirm
        if [ "$confirm" = "yes" ]; then
            print_info "Stopping all services and removing volumes..."
            docker-compose down -v
            print_status "All services stopped and data removed"
        else
            print_info "Operation cancelled"
        fi
        ;;
    3)
        print_info "Service status:"
        docker-compose ps
        exit 0
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

echo ""
print_status "Development environment stopped!"
echo ""
print_header "📋 To start again:"
echo "  ./start-dev.sh"
echo ""
print_header "🧹 Cleanup options:"
echo "  Remove all data: docker-compose down -v"
echo "  Remove images:   docker-compose down --rmi all"
echo "  Full cleanup:    docker system prune -a"
