#!/bin/bash

# Badminton Court Planner - VPS Setup Script
# This script installs and configures the Flask application on a Ubuntu/Debian VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="badminton"
APP_DIR="/var/www/$APP_NAME"
SERVICE_USER="www-data"
DOMAIN="your-domain.com"

echo -e "${GREEN}🏸 Badminton Court Planner VPS Setup${NC}"
echo "======================================="

# Function to print status
print_status() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo)"
   exit 1
fi

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
print_status "Installing required packages..."
apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    nginx \
    postgresql \
    postgresql-contrib \
    redis-server \
    git \
    curl \
    ufw \
    certbot \
    python3-certbot-nginx \
    build-essential \
    libpq-dev

# Create application directory
print_status "Creating application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Create virtual environment
print_status "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Set up PostgreSQL database
print_status "Setting up PostgreSQL database..."
sudo -u postgres createuser --createdb $APP_NAME || true
sudo -u postgres createdb ${APP_NAME}_db || true

# Generate secret key
print_status "Generating application secret key..."
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# Create environment file
print_status "Creating environment configuration..."
cat > .env << EOF
FLASK_ENV=production
SECRET_KEY=$SECRET_KEY
DATABASE_URL=postgresql://$APP_NAME:change_this_password@localhost/${APP_NAME}_db
DEBUG=False
PORT=8000
HOST=127.0.0.1
LOG_LEVEL=INFO
EOF

# Set proper permissions
print_status "Setting file permissions..."
chown -R $SERVICE_USER:$SERVICE_USER $APP_DIR
chmod -R 755 $APP_DIR
chmod 600 $APP_DIR/.env

# Create log directories
print_status "Creating log directories..."
mkdir -p /var/log/gunicorn
mkdir -p /var/run/gunicorn
chown -R $SERVICE_USER:$SERVICE_USER /var/log/gunicorn
chown -R $SERVICE_USER:$SERVICE_USER /var/run/gunicorn

# Initialize database
print_status "Initializing database..."
sudo -u $SERVICE_USER $APP_DIR/venv/bin/python $APP_DIR/app.py

# Install systemd service
print_status "Installing systemd service..."
cp $APP_DIR/badminton.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable badminton
systemctl start badminton

# Configure Nginx
print_status "Configuring Nginx..."
cp $APP_DIR/nginx/badminton /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/badminton /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Update Nginx configuration with actual domain
sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/badminton

# Test Nginx configuration
nginx -t

# Configure firewall
print_status "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Start services
print_status "Starting services..."
systemctl restart nginx
systemctl restart badminton

# SSL Certificate setup
print_status "Setting up SSL certificate..."
echo "Run the following command to get SSL certificate:"
echo "certbot --nginx -d $DOMAIN -d www.$DOMAIN"

print_success "Installation completed!"
echo ""
echo "Next steps:"
echo "1. Update the domain name in /etc/nginx/sites-available/badminton"
echo "2. Update the database password in $APP_DIR/.env"
echo "3. Run: sudo systemctl restart badminton"
echo "4. Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "5. Test your application at: http://$DOMAIN"
echo ""
echo "Useful commands:"
echo "- Check app status: sudo systemctl status badminton"
echo "- View app logs: sudo journalctl -u badminton -f"
echo "- Restart app: sudo systemctl restart badminton"
echo "- Check nginx: sudo nginx -t && sudo systemctl reload nginx"