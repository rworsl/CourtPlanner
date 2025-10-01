#!/bin/bash

# Badminton Court Planner - Quick Start Script
# This script helps you get the application running quickly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${BLUE}🏸 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if Docker is available
check_docker() {
    if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if Python is available
check_python() {
    if command -v python3 &> /dev/null && command -v pip3 &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Generate secure environment file
setup_environment() {
    print_header "Setting up environment variables..."
    
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            print_success "Created .env from .env.example"
        else
            cat > .env << EOF
# Flask Configuration
FLASK_ENV=development
SECRET_KEY=$(openssl rand -hex 32)
DEBUG=True

# Database Configuration
DATABASE_URL=sqlite:///badminton.db

# Docker PostgreSQL (for production)
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Demo Configuration
DEMO_RESET_INTERVAL=10

# Optional: Stripe Configuration
# STRIPE_PUBLISHABLE_KEY=pk_test_your_key
# STRIPE_SECRET_KEY=sk_test_your_key
EOF
            print_success "Created .env file with secure defaults"
        fi
    else
        print_info ".env file already exists"
    fi
}

# Docker setup
setup_docker() {
    print_header "Starting with Docker..."
    
    # Check if docker-compose.yml exists
    if [[ ! -f docker-compose.yml ]]; then
        print_error "docker-compose.yml not found!"
        return 1
    fi
    
    # Build and start services
    print_info "Building Docker images..."
    docker-compose build
    
    print_info "Starting services..."
    docker-compose up -d
    
    # Wait for services to be ready
    print_info "Waiting for services to start..."
    sleep 10
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        print_success "Services are running!"
        
        echo ""
        print_header "🎉 Setup Complete!"
        echo "Access your application at: http://localhost"
        echo ""
        echo "Demo login:"
        echo "  Club Code: DEMO123"
        echo "  Admin Users: Alice Johnson, Carol Davis"
        echo "  Regular Users: Henry Chen, Olivia Taylor"
        echo ""
        echo "Useful commands:"
        echo "  View logs: docker-compose logs -f"
        echo "  Stop: docker-compose down"
        echo "  Restart: docker-compose restart"
        
        return 0
    else
        print_error "Services failed to start properly"
        docker-compose logs
        return 1
    fi
}

# Local Python setup
setup_local() {
    print_header "Starting with local Python..."
    
    # Create virtual environment
    if [[ ! -d "venv" ]]; then
        print_info "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    print_info "Activating virtual environment..."
    source venv/bin/activate
    
    # Install dependencies
    print_info "Installing dependencies..."
    pip install -r requirements.txt
    
    # Initialize database
    print_info "Initializing database..."
    if [[ -f "migrate_db.py" ]]; then
        python migrate_db.py
    else
        python app_corrected.py &
        APP_PID=$!
        sleep 5
        kill $APP_PID
    fi
    
    print_success "Database initialized!"
    
    echo ""
    print_header "🎉 Setup Complete!"
    echo "To start the application:"
    echo "  source venv/bin/activate"
    echo "  python app_corrected.py"
    echo ""
    echo "Then access at: http://localhost:5000"
    echo ""
    echo "Demo login:"
    echo "  Club Code: DEMO123"
    echo "  Admin Users: Alice Johnson, Carol Davis"
}

# Main menu
show_menu() {
    echo ""
    print_header "Badminton Court Planner - Quick Start"
    echo "====================================="
    echo ""
    echo "Choose your setup method:"
    echo ""
    echo "1) Docker (Recommended - Production ready)"
    echo "2) Local Python (Development)"
    echo "3) Help & Requirements"
    echo "4) Exit"
    echo ""
    read -p "Enter your choice (1-4): " choice
}

# Help and requirements
show_help() {
    print_header "Requirements & Help"
    echo ""
    echo "Docker Setup Requirements:"
    echo "  - Docker Engine 20.0+"
    echo "  - Docker Compose 1.29+"
    echo "  - 2GB RAM minimum"
    echo ""
    echo "Local Setup Requirements:"
    echo "  - Python 3.8+"
    echo "  - pip"
    echo "  - Virtual environment support"
    echo ""
    echo "Features:"
    echo "  ✅ Club management with subscription tiers"
    echo "  ✅ Member management and roles"
    echo "  ✅ ELO rating system"
    echo "  ✅ Game recording and statistics"
    echo "  ✅ Match suggestions"
    echo "  ✅ Court management"
    echo "  ✅ Demo data for testing"
    echo "  ✅ Responsive web interface"
    echo ""
    echo "For issues, check:"
    echo "  - Logs: docker-compose logs (Docker) or console output (Local)"
    echo "  - Port conflicts: Make sure ports 80, 5432, 6379 are free"
    echo "  - Permissions: Ensure proper file permissions"
}

# Main execution
main() {
    # Create necessary directories
    mkdir -p templates static/css static/js nginx logs
    
    while true; do
        show_menu
        
        case $choice in
            1)
                if check_docker; then
                    setup_environment
                    if setup_docker; then
                        break
                    else
                        print_error "Docker setup failed. Please check the logs above."
                        read -p "Press Enter to continue..."
                    fi
                else
                    print_error "Docker or Docker Compose not found!"
                    print_info "Please install Docker first:"
                    echo "  https://docs.docker.com/get-docker/"
                    read -p "Press Enter to continue..."
                fi
                ;;
            2)
                if check_python; then
                    setup_environment
                    if setup_local; then
                        break
                    else
                        print_error "Local setup failed. Please check the error above."
                        read -p "Press Enter to continue..."
                    fi
                else
                    print_error "Python 3 or pip3 not found!"
                    print_info "Please install Python 3.8+ first"
                    read -p "Press Enter to continue..."
                fi
                ;;
            3)
                show_help
                read -p "Press Enter to continue..."
                ;;
            4)
                print_info "Goodbye!"
                exit 0
                ;;
            *)
                print_warning "Invalid choice. Please select 1-4."
                read -p "Press Enter to continue..."
                ;;
        esac
    done
}

# Check if running as script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi