# Badminton Court Planner - Flask Web Application

A complete badminton club management system built with Flask, featuring court scheduling, player management, ELO rankings, and match tracking.

## Features

- **Club Management**: Create and manage badminton clubs with unique codes
- **Player Management**: Add/remove players, track statistics and ELO ratings
- **Court Scheduling**: Manage multiple courts with intelligent match assignments
- **Game Tracking**: Record match results with automatic ELO calculations
- **Rankings System**: Real-time player rankings based on ELO ratings
- **Match Suggestions**: AI-powered balanced match recommendations
- **Admin Controls**: Role-based permissions for club administrators
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Technology Stack

- **Backend**: Flask (Python)
- **Database**: SQLAlchemy with SQLite/PostgreSQL support
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Server**: Gunicorn WSGI server
- **Web Server**: Nginx reverse proxy
- **Containerization**: Docker & Docker Compose support

## Quick Start with Docker

1. **Clone and configure**:
```bash
git clone 
cd badminton-court-planner
cp .env.example .env
# Edit .env with your configuration
```

2. **Start with Docker Compose**:
```bash
docker-compose up -d
```

3. **Access the application**:
   - Open http://localhost in your browser
   - Try the demo with club code `DEMO123`
   - Admin users: "Alice Johnson" or "Carol Davis"

## VPS Deployment

### Prerequisites

- Ubuntu 20.04+ or Debian 11+ VPS
- Root or sudo access
- Domain name pointing to your VPS (optional but recommended)

### Automatic Installation

1. **Upload files to your VPS**:
```bash
scp -r * user@your-vps-ip:/tmp/badminton/
```

2. **Run the setup script**:
```bash
sudo chmod +x /tmp/badminton/setup.sh
sudo /tmp/badminton/setup.sh
```

3. **Configure domain and SSL**:
```bash
# Edit the domain in nginx config
sudo nano /etc/nginx/sites-available/badminton

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Manual Installation

#### 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3 python3-pip python3-venv nginx postgresql redis-server
```

#### 2. Application Setup

```bash
# Create application directory
sudo mkdir -p /var/www/badminton
cd /var/www/badminton

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

#### 3. Database Setup

```bash
# Create PostgreSQL database
sudo -u postgres createuser --createdb badminton
sudo -u postgres createdb badminton_db

# Configure environment
cp .env.example .env
# Edit .env with your database credentials
```

#### 4. Application Configuration

```bash
# Initialize database
python app.py

# Set permissions
sudo chown -R www-data:www-data /var/www/badminton
```

#### 5. Service Setup

```bash
# Install systemd service
sudo cp badminton.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable badminton
sudo systemctl start badminton
```

#### 6. Nginx Configuration

```bash
# Install nginx config
sudo cp nginx/badminton /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/badminton /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Update domain name
sudo nano /etc/nginx/sites-available/badminton

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

#### 7. SSL Certificate (Optional)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Flask Configuration
FLASK_ENV=production
SECRET_KEY=your-secret-key-here
DEBUG=False

# Database (Choose one)
DATABASE_URL=sqlite:///badminton.db
# DATABASE_URL=postgresql://username:password@localhost/badminton_db

# Server
PORT=8000
HOST=127.0.0.1
```

### Database Configuration

#### SQLite (Default)
- Suitable for small to medium clubs (< 100 players)
- No additional setup required
- Database file: `badminton.db`

#### PostgreSQL (Recommended for Production)
- Better performance for larger clubs
- Concurrent access support
- Backup and replication capabilities

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createuser badminton
sudo -u postgres createdb badminton_db
sudo -u postgres psql -c "ALTER USER badminton PASSWORD 'your-password';"
```

## File Structure

```
badminton-court-planner/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── gunicorn.conf.py      # Gunicorn configuration
├── .env.example          # Environment variables template
├── badminton.service     # Systemd service file
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose setup
├── setup.sh              # Automated installation script
├── templates/            # HTML templates
│   ├── base.html
│   ├── index.html
│   └── dashboard.html
├── static/               # Static assets
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       └── dashboard.js
└── nginx/                # Nginx configuration
    └── badminton
```

## Usage

### Getting Started

1. **Create a Club**:
   - Visit your domain
   - Click "Create new club"
   - Enter club details and admin name

2. **Try Demo Data**:
   - Use club code: `DEMO123`
   - Admin users: "Alice Johnson", "Carol Davis"
   - Regular users: "Henry Chen", "Olivia Taylor", etc.

### Managing Your Club

#### Admin Features
- Add/remove members
- Promote/demote administrators
- Edit game scores
- Delete games
- Manage court settings

#### Member Features
- View club rankings
- See game history
- Access match suggestions
- Update active player status

### Court Management

1. **Set Active Players**: Select who's present for the session
2. **Auto-Assign Courts**: Generate balanced matches automatically
3. **Manual Assignment**: Assign specific players to courts
4. **Record Scores**: Enter match results to update ELO ratings

## Monitoring and Maintenance

### Service Management

```bash
# Check application status
sudo systemctl status badminton

# View logs
sudo journalctl -u badminton -f

# Restart application
sudo systemctl restart badminton

# Update application
cd /var/www/badminton
git pull origin main
sudo systemctl restart badminton
```

### Database Backup

```bash
# SQLite backup
cp /var/www/badminton/badminton.db /backup/badminton-$(date +%Y%m%d).db

# PostgreSQL backup
pg_dump badminton_db > /backup/badminton-$(date +%Y%m%d).sql
```

### Log Locations

- Application logs: `/var/log/gunicorn/`
- Nginx logs: `/var/log/nginx/`
- System logs: `sudo journalctl -u badminton`

## Troubleshooting

### Common Issues

1. **Application won't start**:
   - Check logs: `sudo journalctl -u badminton -f`
   - Verify environment: `sudo systemctl status badminton`
   - Check permissions: `ls -la /var/www/badminton`

2. **Database connection errors**:
   - Verify `.env` configuration
   - Check database service: `sudo systemctl status postgresql`
   - Test connection: `psql -U badminton -d badminton_db -h localhost`

3. **Nginx 502 errors**:
   - Check if Flask app is running: `sudo systemctl status badminton`
   - Verify Gunicorn socket: `netstat -tlnp | grep 8000`
   - Check nginx config: `sudo nginx -t`

4. **SSL certificate issues**:
   - Renew certificate: `sudo certbot renew`
   - Check certificate status: `sudo certbot certificates`

### Performance Optimization

1. **Database**:
   - Use PostgreSQL for production
   - Regular VACUUM and ANALYZE
   - Monitor query performance

2. **Application**:
   - Adjust Gunicorn workers in `gunicorn.conf.py`
   - Enable Redis for caching (future feature)
   - Monitor memory usage

3. **Web Server**:
   - Enable gzip compression
   - Set proper cache headers
   - Use CDN for static assets

## Security Considerations

- Change default passwords and secrets
- Keep system and dependencies updated
- Use HTTPS in production
- Regular database backups
- Monitor access logs
- Implement rate limiting if needed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Create an issue on GitHub

---

**Note**: This application includes a demo club (DEMO123) with sample data for testing. Remove or modify demo data before production use.