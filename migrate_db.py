"""
Simple database setup for Badminton Court Planner
Creates fresh database with subscription features
"""

import sqlite3
import os
from datetime import datetime

def setup_database():
    """Create a fresh database with all required tables"""
    
    # Remove existing database if it exists
    if os.path.exists('badminton.db'):
        os.remove('badminton.db')
        print("🗑️ Deleted existing database")
    
    print("🔄 Creating new database...")
    
    # Create database connection
    conn = sqlite3.connect('badminton.db')
    cursor = conn.cursor()
    
    try:
        # Create Club table with all new columns
        print("📝 Creating Club table...")
        cursor.execute('''
            CREATE TABLE club (
                id INTEGER PRIMARY KEY,
                code VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                courts INTEGER DEFAULT 4,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                subscription_tier VARCHAR(20) DEFAULT 'free',
                subscription_expires DATETIME,
                demo_session_start DATETIME
            )
        ''')
        
        # Create Member table
        print("📝 Creating Member table...")
        cursor.execute('''
            CREATE TABLE member (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                club_id INTEGER NOT NULL,
                elo INTEGER DEFAULT 1200,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                role VARCHAR(20) DEFAULT 'member',
                partner_stats TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (club_id) REFERENCES club(id)
            )
        ''')
        
        # Create Game table
        print("📝 Creating Game table...")
        cursor.execute('''
            CREATE TABLE game (
                id INTEGER PRIMARY KEY,
                club_id INTEGER NOT NULL,
                date DATE DEFAULT (date('now')),
                time TIME DEFAULT (time('now')),
                court VARCHAR(20),
                team1_player1 VARCHAR(100) NOT NULL,
                team1_player2 VARCHAR(100) NOT NULL,
                team2_player1 VARCHAR(100) NOT NULL,
                team2_player2 VARCHAR(100) NOT NULL,
                team1_score INTEGER NOT NULL,
                team2_score INTEGER NOT NULL,
                winner INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (club_id) REFERENCES club(id)
            )
        ''')
        
        # Create indexes
        print("📝 Creating indexes...")
        cursor.execute('CREATE INDEX idx_club_code ON club(code)')
        cursor.execute('CREATE INDEX idx_member_club_id ON member(club_id)')
        cursor.execute('CREATE INDEX idx_game_club_id ON game(club_id)')
        
        # Commit the schema
        conn.commit()
        print("✅ Database schema created successfully!")
        
    except Exception as e:
        print(f"❌ Database creation failed: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()
    
    return True

if __name__ == "__main__":
    print("🏸 Badminton Court Planner - Database Setup")
    print("=" * 45)
    
    if setup_database():
        print("\n🎯 Database setup successful!")
        print("Now run: python app.py")
    else:
        print("\n❌ Database setup failed!")
    
    input("\nPress Enter to exit...")