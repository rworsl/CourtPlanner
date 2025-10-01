from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timedelta, timezone
import os
import secrets
import json
from sqlalchemy import func, desc
import threading
import time
from functools import wraps
import stripe
from dotenv import load_dotenv

app = Flask(__name__)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///badminton.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


# Load environment variables
load_dotenv()

# Stripe configuration
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLIC_KEY = os.getenv('STRIPE_PUBLIC_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
STRIPE_PRICE_PRO = os.getenv('STRIPE_PRICE_PRO')
STRIPE_PRICE_ELITE = os.getenv('STRIPE_PRICE_ELITE')
DOMAIN = os.getenv('DOMAIN', 'http://localhost:5000')

# Update Flask config
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

# Initialize extensions
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Subscription tiers
SUBSCRIPTION_TIERS = {
    'free': {
        'name': 'Starter',
        'price': 0,
        'max_members': 10,
        'max_courts': 2,
        'features': ['basic_tracking', 'simple_rankings']
    },
    'pro': {
        'name': 'Club Pro',
        'price': 10,
        'max_members': 50,
        'max_courts': 999,
        'features': ['basic_tracking', 'simple_rankings', 'elo_system', 'match_suggestions', 'basic_analytics', 'auto_run_sessions']
    },
    'elite': {
        'name': 'Club Elite',
        'price': 20,
        'max_members': 9999,
        'max_courts': 999,
        'features': ['basic_tracking', 'simple_rankings', 'elo_system', 'match_suggestions', 'advanced_analytics', 'tournament_mode', 'priority_support', 'auto_run_sessions']
    }
}

# Demo management
demo_reset_time = None
demo_lock = threading.Lock()

# Models with Subscription Features
class Club(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)
    courts = db.Column(db.Integer, default=4)
    subscription_tier = db.Column(db.String(20), default='free')
    stripe_customer_id = db.Column(db.String(100))  # Add this
    stripe_subscription_id = db.Column(db.String(100))  # Add this
    demo_session_start = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())
    
    members = db.relationship('Member', backref='club', lazy=True, cascade='all, delete-orphan')
    games = db.relationship('Game', backref='club', lazy=True, cascade='all, delete-orphan')
    tournaments = db.relationship('Tournament', backref='club', lazy=True, cascade='all, delete-orphan')

    def is_demo(self):
        return self.code == 'DEMO123'
    
    def is_demo_expired(self):
        if not self.is_demo() or not self.demo_session_start:
            return False
    
        # Make sure both datetimes are timezone-naive for comparison
        now = datetime.now()  # Remove timezone.utc to make it naive
        
        # If demo_session_start is timezone-aware, make it naive
        if self.demo_session_start.tzinfo is not None:
            demo_start = self.demo_session_start.replace(tzinfo=None)
        else:
            demo_start = self.demo_session_start
        
        return now - demo_start > timedelta(minutes=10)
    
    def get_subscription_limits(self):
        return SUBSCRIPTION_TIERS.get(self.subscription_tier, SUBSCRIPTION_TIERS['free'])
    
    def has_feature(self, feature):
        tier_features = SUBSCRIPTION_TIERS.get(self.subscription_tier, SUBSCRIPTION_TIERS['free'])['features']
        return feature in tier_features
    
    def can_add_member(self):
        current_count = len(self.members)
        max_members = self.get_subscription_limits()['max_members']
        return current_count < max_members
    
    def can_add_court(self, court_count):
        max_courts = self.get_subscription_limits()['max_courts']
        return court_count <= max_courts

class Member(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    elo = db.Column(db.Integer, default=1200)
    games_played = db.Column(db.Integer, default=0)
    games_won = db.Column(db.Integer, default=0)
    role = db.Column(db.String(20), default='member')  # 'admin' or 'member'
    partner_stats = db.Column(db.Text, default='{}')  # JSON string
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    def get_partner_stats(self):
        return json.loads(self.partner_stats) if self.partner_stats else {}
    
    def update_partner_stats(self, partner_name, won):
        stats = self.get_partner_stats()
        if partner_name not in stats:
            stats[partner_name] = {'games': 0, 'wins': 0}
        stats[partner_name]['games'] += 1
        if won:
            stats[partner_name]['wins'] += 1
        self.partner_stats = json.dumps(stats)
    
    def get_win_rate(self):
        return (self.games_won / self.games_played * 100) if self.games_played > 0 else 0

class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    date = db.Column(db.Date, default=date.today)
    time = db.Column(db.Time, default=datetime.now().time)
    court = db.Column(db.String(20))
    team1_player1 = db.Column(db.String(100), nullable=False)
    team1_player2 = db.Column(db.String(100), nullable=False)
    team2_player1 = db.Column(db.String(100), nullable=False)
    team2_player2 = db.Column(db.String(100), nullable=False)
    team1_score = db.Column(db.Integer, nullable=False)
    team2_score = db.Column(db.Integer, nullable=False)
    winner = db.Column(db.Integer, nullable=False)  # 1 or 2
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class Tournament(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='setup')  # setup, group_stage, knockout, completed
    num_groups = db.Column(db.Integer, default=2)
    knockout_rounds = db.Column(db.Integer, default=2)  # 2 = semifinals + final, 3 = quarters + semis + final
    current_stage = db.Column(db.String(50), default='groups')
    teams = db.Column(db.Text, default='[]')  # JSON array of team objects
    groups = db.Column(db.Text, default='{}')  # JSON object of group assignments
    group_results = db.Column(db.Text, default='{}')  # JSON object of group standings
    knockout_bracket = db.Column(db.Text, default='{}')  # JSON object of knockout matches
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())
    
    def get_teams(self):
        return json.loads(self.teams) if self.teams else []
    
    def set_teams(self, teams_list):
        self.teams = json.dumps(teams_list)
    
    def get_groups(self):
        return json.loads(self.groups) if self.groups else {}
    
    def set_groups(self, groups_dict):
        self.groups = json.dumps(groups_dict)
    
    def get_group_results(self):
        return json.loads(self.group_results) if self.group_results else {}
    
    def set_group_results(self, results_dict):
        self.group_results = json.dumps(results_dict)
    
    def get_knockout_bracket(self):
        return json.loads(self.knockout_bracket) if self.knockout_bracket else {}
    
    def set_knockout_bracket(self, bracket_dict):
        self.knockout_bracket = json.dumps(bracket_dict)

# Helper functions
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'club_code' not in session or 'player_name' not in session:
            return redirect(url_for('index'))
        
        # Check if demo has expired
        club = get_current_club()
        if club and club.is_demo() and club.is_demo_expired():
            reset_demo_data()
            session.clear()
            return redirect(url_for('index'))
        
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_current_player_admin():
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def subscription_required(feature):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            club = get_current_club()
            if not club:
                return jsonify({'success': False, 'error': 'No active club session'})
            
            subscription_info = club.get_subscription_limits()
            
            if feature not in subscription_info['features']:
                return jsonify({
                    'success': False, 
                    'error': f'This feature requires a higher subscription tier. Current tier: {club.subscription_tier}'
                })
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def get_current_club():
    if 'club_code' not in session:
        return None
    return Club.query.filter_by(code=session['club_code']).first()

def get_current_player():
    club = get_current_club()
    if not club or 'player_name' not in session:
        return None
    return Member.query.filter_by(club_id=club.id, name=session['player_name']).first()

def is_current_player_admin():
    player = get_current_player()
    return player and player.role == 'admin'

def calculate_elo_change(team1_elo, team2_elo, team1_won, k=32):
    expected_score = 1 / (1 + pow(10, (team2_elo - team1_elo) / 400))
    actual_score = 1 if team1_won else 0
    return k * (actual_score - expected_score)

def update_player_stats_and_elo(game):
    club = get_current_club()
    
    # Get all players
    players = {
        'team1': [
            Member.query.filter_by(club_id=club.id, name=game.team1_player1).first(),
            Member.query.filter_by(club_id=club.id, name=game.team1_player2).first()
        ],
        'team2': [
            Member.query.filter_by(club_id=club.id, name=game.team2_player1).first(),
            Member.query.filter_by(club_id=club.id, name=game.team2_player2).first()
        ]
    }
    
    # Update basic stats
    all_players = players['team1'] + players['team2']
    winners = players[f'team{game.winner}']
    
    for player in all_players:
        if player:
            player.games_played += 1
            if player in winners:
                player.games_won += 1
    
    # Update partner stats
    for team_players in players.values():
        if team_players[0] and team_players[1]:
            won = team_players in [players['team1'] if game.winner == 1 else [], players['team2'] if game.winner == 2 else []]
            team_players[0].update_partner_stats(team_players[1].name, won)
            team_players[1].update_partner_stats(team_players[0].name, won)
    
    # Update ELO ratings (only if club has elo_system feature)
    if club.has_feature('elo_system'):
        team1_elo = (players['team1'][0].elo + players['team1'][1].elo) / 2
        team2_elo = (players['team2'][0].elo + players['team2'][1].elo) / 2
        
        elo_change = calculate_elo_change(team1_elo, team2_elo, game.winner == 1)
        
        for player in players['team1']:
            if player:
                player.elo = round(player.elo + elo_change)
        
        for player in players['team2']:
            if player:
                player.elo = round(player.elo - elo_change)

def recalculate_all_stats():
    """Recalculate all player stats from scratch based on game history"""
    club = get_current_club()
    if not club:
        return
    
    # Reset all player stats
    for member in club.members:
        member.games_played = 0
        member.games_won = 0
        member.elo = 1200
        member.partner_stats = '{}'
    
    # Replay all games in chronological order
    games = Game.query.filter_by(club_id=club.id).order_by(Game.created_at).all()
    for game in games:
        update_player_stats_and_elo(game)
    
    db.session.commit()

def reset_demo_data():
    """Reset demo club to original state"""
    with demo_lock:
        demo_club = Club.query.filter_by(code='DEMO123').first()
        if demo_club:
            # Delete all existing data
            Game.query.filter_by(club_id=demo_club.id).delete()
            Member.query.filter_by(club_id=demo_club.id).delete()
            db.session.delete(demo_club)
            db.session.commit()
        
        # Recreate demo data
        create_demo_data()

def start_demo_timer():
    """Start or restart the demo timer"""
    club = Club.query.filter_by(code='DEMO123').first()
    if club:
        club.demo_session_start = datetime.now()  # Remove timezone.utc
        db.session.commit()

def get_auto_next_match(club_id, active_players_list):
    """Get the best next match for auto-run sessions"""
    if len(active_players_list) < 4:
        return None
    
    # Get member objects
    members = Member.query.filter_by(club_id=club_id).filter(Member.name.in_(active_players_list)).all()
    
    if len(members) < 4:
        return None
    
    # Find best balanced match
    best_match = None
    best_balance = float('inf')
    
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            for k in range(len(members)):
                for l in range(k + 1, len(members)):
                    if k != i and k != j and l != i and l != j:
                        team1 = [members[i], members[j]]
                        team2 = [members[k], members[l]]
                        
                        team1_elo = (team1[0].elo + team1[1].elo) / 2
                        team2_elo = (team2[0].elo + team2[1].elo) / 2
                        balance = abs(team1_elo - team2_elo)
                        
                        if balance < best_balance:
                            best_balance = balance
                            best_match = {
                                'team1': team1,
                                'team2': team2,
                                'balance': balance
                            }
    
    return best_match

# Routes
@app.route('/')
def index():
    if 'club_code' in session and 'player_name' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/health')
def health_check():
    """Health check endpoint for load balancers and monitoring"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now(timezone.utc).isoformat()})

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    club_code = data.get('club_code', '').strip()
    player_name = data.get('player_name', '').strip()
    
    if not club_code or not player_name:
        return jsonify({'success': False, 'error': 'Please enter both club code and player name'})
    
    club = Club.query.filter_by(code=club_code).first()
    if not club:
        return jsonify({'success': False, 'error': 'Club not found. Please check your club code or create a new club.'})
    
    # Handle demo club
    if club.is_demo():
        if club.is_demo_expired():
            print("Demo expired, resetting...")
            reset_demo_data()
            club = Club.query.filter_by(code='DEMO123').first()  # Get fresh demo data
        
        # Always restart the timer when someone logs into demo
        start_demo_timer()
        print(f"Demo timer started/restarted at {club.demo_session_start}")
    
    member = Member.query.filter_by(club_id=club.id, name=player_name).first()
    if not member:
        return jsonify({'success': False, 'error': 'Player not found in this club. Please contact your club admin.'})
    
    session['club_code'] = club_code
    session['player_name'] = player_name
    
    return jsonify({'success': True})

@app.route('/create_club', methods=['POST'])
def create_club():
    data = request.get_json()
    club_code = data.get('club_code', '').strip()
    club_name = data.get('club_name', '').strip()
    admin_name = data.get('admin_name', '').strip()
    
    if not club_code or not club_name or not admin_name:
        return jsonify({'success': False, 'error': 'Please fill in all fields'})
    
    if club_code == 'DEMO123':
        return jsonify({'success': False, 'error': 'DEMO123 is reserved. Please choose a different code.'})
    
    if Club.query.filter_by(code=club_code).first():
        return jsonify({'success': False, 'error': 'Club code already exists. Please choose a different code.'})
    
    # Create club with free tier by default
    club = Club(
        code=club_code, 
        name=club_name, 
        subscription_tier='free',
        subscription_expires=datetime.now(timezone.utc) + timedelta(days=30)  # 30-day free trial
    )
    db.session.add(club)
    db.session.flush()  # To get the club ID
    
    # Create admin member
    admin = Member(name=admin_name, club_id=club.id, role='admin')
    db.session.add(admin)
    db.session.commit()
    
    session['club_code'] = club_code
    session['player_name'] = admin_name
    
    return jsonify({'success': True})

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/club_info')
@login_required
def club_info():
    club = get_current_club()
    player = get_current_player()
    
    if not club or not player:
        return jsonify({'success': False, 'error': 'Invalid session'})
    
    subscription_info = club.get_subscription_limits()
    demo_time_left = None
    
    if club.is_demo() and club.demo_session_start:
        # Make sure both are timezone-naive
        now = datetime.now()
        demo_start = club.demo_session_start
        
        # Convert to naive if needed
        if hasattr(demo_start, 'tzinfo') and demo_start.tzinfo is not None:
            demo_start = demo_start.replace(tzinfo=None)
        
        elapsed = now - demo_start
        remaining = timedelta(minutes=10) - elapsed
        demo_time_left = int(remaining.total_seconds()) if remaining.total_seconds() > 0 else 0
    
    return jsonify({
    'success': True,
    'club': {
        'name': club.name,
        'code': club.code,
        'courts': club.courts,
        'total_members': len(club.members),
        'games_played': len(club.games),
        'is_demo': club.is_demo(),
        'demo_time_left': demo_time_left,
        'subscription': {  # Make sure this is included
            'tier': club.subscription_tier,
            'name': subscription_info['name'],
            'max_members': subscription_info['max_members'],
            'max_courts': subscription_info['max_courts'],
            'features': subscription_info['features']
        }
    },
    'player': {
        'name': player.name,
        'elo': player.elo,
        'role': player.role,
        'games_played': player.games_played,
        'games_won': player.games_won,
        'win_rate': player.get_win_rate()
    }
})

@app.route('/api/members')
@login_required
def get_members():
    club = get_current_club()
    members_data = []
    
    for member in club.members:
        partner_stats = member.get_partner_stats()
        partner_display = []
        for partner, stats in partner_stats.items():
            win_rate = (stats['wins'] / stats['games'] * 100) if stats['games'] > 0 else 0
            partner_display.append(f"{partner}: {win_rate:.1f}% ({stats['wins']}/{stats['games']})")
        
        members_data.append({
            'name': member.name,
            'elo': member.elo,
            'games_played': member.games_played,
            'games_won': member.games_won,
            'win_rate': member.get_win_rate(),
            'role': member.role,
            'partner_stats': ', '.join(partner_display) if partner_display else 'No partner history'
        })
    
    return jsonify({
        'success': True,
        'members': members_data,
        'is_admin': is_current_player_admin(),
        'can_add_more': club.can_add_member()
    })

@app.route('/api/add_member', methods=['POST'])
@login_required
@admin_required
def add_member():
    club = get_current_club()
    
    if not club.can_add_member():
        limits = club.get_subscription_limits()
        return jsonify({
            'success': False, 
            'error': f'Member limit reached ({limits["max_members"]} members). Please upgrade your subscription.'
        })
    
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'success': False, 'error': 'Please enter a member name'})
    
    if Member.query.filter_by(club_id=club.id, name=name).first():
        return jsonify({'success': False, 'error': 'Member already exists'})
    
    member = Member(name=name, club_id=club.id)
    db.session.add(member)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Member added successfully!'})

@app.route('/api/remove_member', methods=['POST'])
@login_required
@admin_required
def remove_member():
    data = request.get_json()
    member_name = data.get('member_name', '').strip()
    
    if member_name == session['player_name']:
        return jsonify({'success': False, 'error': 'You cannot remove yourself from the club'})
    
    club = get_current_club()
    member = Member.query.filter_by(club_id=club.id, name=member_name).first()
    
    if not member:
        return jsonify({'success': False, 'error': 'Member not found'})
    
    db.session.delete(member)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Member removed successfully'})

@app.route('/api/promote_member', methods=['POST'])
@login_required
@admin_required
def promote_member():
    data = request.get_json()
    member_name = data.get('member_name', '').strip()
    
    club = get_current_club()
    member = Member.query.filter_by(club_id=club.id, name=member_name).first()
    
    if not member:
        return jsonify({'success': False, 'error': 'Member not found'})
    
    member.role = 'admin'
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'{member_name} has been promoted to administrator'})

@app.route('/api/demote_member', methods=['POST'])
@login_required
@admin_required
def demote_member():
    data = request.get_json()
    member_name = data.get('member_name', '').strip()
    
    club = get_current_club()
    admin_count = Member.query.filter_by(club_id=club.id, role='admin').count()
    
    if admin_count <= 1:
        return jsonify({'success': False, 'error': 'Cannot demote the last administrator. Promote another member to admin first.'})
    
    member = Member.query.filter_by(club_id=club.id, name=member_name).first()
    
    if not member:
        return jsonify({'success': False, 'error': 'Member not found'})
    
    member.role = 'member'
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'{member_name} has been demoted to regular member'})

@app.route('/api/update_courts', methods=['POST'])
@login_required
def update_courts():
    data = request.get_json()
    court_count = data.get('court_count', 4)
    
    club = get_current_club()
    
    if not club.can_add_court(court_count):
        limits = club.get_subscription_limits()
        return jsonify({
            'success': False, 
            'error': f'Court limit exceeded (max {limits["max_courts"]} courts). Please upgrade your subscription.'
        })
    
    club.courts = court_count
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/record_game', methods=['POST'])
@login_required
def record_game():
    data = request.get_json()
    
    required_fields = ['team1_player1', 'team1_player2', 'team2_player1', 'team2_player2', 'team1_score', 'team2_score']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'Missing field: {field}'})
    
    players = [data['team1_player1'], data['team1_player2'], data['team2_player1'], data['team2_player2']]
    if len(set(players)) != 4:
        return jsonify({'success': False, 'error': 'All players must be different'})
    
    team1_score = int(data['team1_score'])
    team2_score = int(data['team2_score'])
    
    if team1_score == team2_score:
        return jsonify({'success': False, 'error': 'Match cannot end in a tie'})
    
    club = get_current_club()
    game = Game(
        club_id=club.id,
        team1_player1=data['team1_player1'],
        team1_player2=data['team1_player2'],
        team2_player1=data['team2_player1'],
        team2_player2=data['team2_player2'],
        team1_score=team1_score,
        team2_score=team2_score,
        winner=1 if team1_score > team2_score else 2,
        court=data.get('court', 'Manual Entry')
    )
    
    db.session.add(game)
    db.session.flush()
    
    update_player_stats_and_elo(game)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Game recorded successfully!'})

@app.route('/api/games')
@login_required
def get_games():
    club = get_current_club()
    games = Game.query.filter_by(club_id=club.id).order_by(desc(Game.created_at)).limit(20).all()
    
    games_data = []
    for game in games:
        games_data.append({
            'id': game.id,
            'date': game.date.strftime('%Y-%m-%d'),
            'time': game.time.strftime('%H:%M') if game.time else '',
            'court': game.court,
            'team1': [game.team1_player1, game.team1_player2],
            'team2': [game.team2_player1, game.team2_player2],
            'score': [game.team1_score, game.team2_score],
            'winner': game.winner
        })
    
    return jsonify({
        'success': True,
        'games': games_data,
        'is_admin': is_current_player_admin()
    })

@app.route('/api/edit_game', methods=['POST'])
@login_required
@admin_required
def edit_game():
    data = request.get_json()
    game_id = data.get('game_id')
    team1_score = int(data.get('team1_score'))
    team2_score = int(data.get('team2_score'))
    
    if team1_score == team2_score:
        return jsonify({'success': False, 'error': 'Match cannot end in a tie'})
    
    club = get_current_club()
    game = Game.query.filter_by(id=game_id, club_id=club.id).first()
    
    if not game:
        return jsonify({'success': False, 'error': 'Game not found'})
    
    game.team1_score = team1_score
    game.team2_score = team2_score
    game.winner = 1 if team1_score > team2_score else 2
    
    db.session.commit()
    
    # Recalculate all stats to ensure consistency
    recalculate_all_stats()
    
    return jsonify({'success': True, 'message': 'Game updated successfully!'})

@app.route('/api/delete_game', methods=['POST'])
@login_required
@admin_required
def delete_game():
    data = request.get_json()
    game_id = data.get('game_id')
    
    club = get_current_club()
    game = Game.query.filter_by(id=game_id, club_id=club.id).first()
    
    if not game:
        return jsonify({'success': False, 'error': 'Game not found'})
    
    db.session.delete(game)
    db.session.commit()
    
    # Recalculate all stats to ensure consistency
    recalculate_all_stats()
    
    return jsonify({'success': True, 'message': 'Game deleted successfully!'})

@app.route('/api/rankings')
@login_required
def get_rankings():
    club = get_current_club()
    
    # Only show ELO rankings if club has elo_system feature
    if club.has_feature('elo_system'):
        members = Member.query.filter_by(club_id=club.id).order_by(desc(Member.elo)).all()
    else:
        # Simple rankings by win rate for free tier
        members = Member.query.filter_by(club_id=club.id).order_by(desc(Member.games_won)).all()
    
    rankings_data = []
    for i, member in enumerate(members):
        rankings_data.append({
            'rank': i + 1,
            'name': member.name,
            'elo': member.elo if club.has_feature('elo_system') else None,
            'games_played': member.games_played,
            'games_won': member.games_won,
            'win_rate': member.get_win_rate()
        })
    
    return jsonify({
        'success': True,
        'rankings': rankings_data,
        'has_elo_system': club.has_feature('elo_system')
    })

@app.route('/api/match_suggestions')
@login_required
@subscription_required('match_suggestions')
def get_match_suggestions():
    club = get_current_club()
    members = club.members
    
    if len(members) < 4:
        return jsonify({
            'success': True,
            'suggestions': [],
            'message': 'Need at least 4 members to generate match suggestions'
        })
    
    suggestions = []
    
    # Generate all possible team combinations
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            for k in range(len(members)):
                for l in range(k + 1, len(members)):
                    if k != i and k != j and l != i and l != j:
                        team1 = [members[i], members[j]]
                        team2 = [members[k], members[l]]
                        
                        if club.has_feature('elo_system'):
                            team1_elo = (team1[0].elo + team1[1].elo) / 2
                            team2_elo = (team2[0].elo + team2[1].elo) / 2
                            balance = abs(team1_elo - team2_elo)
                        else:
                            # Simple balance based on games won for free tier
                            team1_wins = team1[0].games_won + team1[1].games_won
                            team2_wins = team2[0].games_won + team2[1].games_won
                            balance = abs(team1_wins - team2_wins)
                        
                        suggestions.append({
                            'team1': [team1[0].name, team1[1].name],
                            'team2': [team2[0].name, team2[1].name],
                            'balance': round(balance)
                        })
    
    # Sort by balance and return top 8
    suggestions.sort(key=lambda x: x['balance'])
    
    return jsonify({
        'success': True,
        'suggestions': suggestions[:8]
    })

# Initialize database
def init_db():
    with app.app_context():
        try:
            print("Initializing database...")
            
            # First, try to create tables normally
            db.create_all()
            
            # Test if we can access the club table with subscription columns
            result = db.session.execute(db.text("SELECT COUNT(*) FROM club WHERE code = 'DEMO123'")).scalar()
            
            # If we get here, the schema is working correctly
            demo_club = Club.query.filter_by(code='DEMO123').first()
            if not demo_club:
                create_demo_data()
                print("Demo data created successfully!")
            else:
                print("Demo club already exists")
                
        except Exception as e:
            print(f"Database initialization error: {e}")
            print("Forcing database recreation...")
            
            try:
                # Force clean recreation if there are schema issues
                db.drop_all()
                db.create_all()
                create_demo_data()
                print("Database recreated successfully with demo data!")
                
            except Exception as recreate_error:
                print(f"Failed to recreate database: {recreate_error}")
                raise recreate_error

def create_demo_data():
    """Create demo club with sample data"""
    try:
        # Check if demo club already exists
        existing_club = Club.query.filter_by(code='DEMO123').first()
        if existing_club:
            print("Demo club already exists, skipping creation")
            return
        
        club = Club(
            code='DEMO123', 
            name='Ace Badminton Club', 
            courts=4,
            subscription_tier='elite',  # Demo has all features
            demo_session_start=datetime.now()
        )
        db.session.add(club)
        db.session.flush()
        
        # Create demo members
        demo_members = [
            {'name': 'Alice Johnson', 'elo': 1250, 'role': 'admin'},
            {'name': 'Bob Smith', 'elo': 1180, 'role': 'member'},
            {'name': 'Carol Davis', 'elo': 1320, 'role': 'admin'},
            {'name': 'David Wilson', 'elo': 1150, 'role': 'member'},
            {'name': 'Emma Thompson', 'elo': 1390, 'role': 'member'},
            {'name': 'Frank Rodriguez', 'elo': 1095, 'role': 'member'},
            {'name': 'Grace Kim', 'elo': 1275, 'role': 'member'},
            {'name': 'Henry Chen', 'elo': 1420, 'role': 'member'},
            {'name': 'Isabella Martinez', 'elo': 1165, 'role': 'member'},
            {'name': 'James Anderson', 'elo': 1340, 'role': 'member'},
            {'name': 'Katie O\'Brien', 'elo': 1220, 'role': 'member'},
            {'name': 'Lucas Singh', 'elo': 1380, 'role': 'member'},
            {'name': 'Maya Patel', 'elo': 1135, 'role': 'member'},
            {'name': 'Nathan Brooks', 'elo': 1290, 'role': 'member'},
            {'name': 'Olivia Taylor', 'elo': 1460, 'role': 'member'},
            {'name': 'Ryan Murphy', 'elo': 1070, 'role': 'member'},
            {'name': 'Sophia Lee', 'elo': 1310, 'role': 'member'},
            {'name': 'Thomas Wright', 'elo': 1195, 'role': 'member'},
            {'name': 'Victoria Clark', 'elo': 1355, 'role': 'member'},
            {'name': 'William Zhang', 'elo': 1125, 'role': 'member'}
        ]
        
        for member_data in demo_members:
            member = Member(
                name=member_data['name'],
                club_id=club.id,
                elo=member_data['elo'],
                role=member_data['role']
            )
            db.session.add(member)
        
        db.session.commit()
        print("Demo club created successfully!")
        
    except Exception as e:
        print(f"Error creating demo data: {e}")
        db.session.rollback()
        raise e

@app.route('/api/advanced_stats')
@login_required
@subscription_required('advanced_analytics')
def get_advanced_stats():
    club = get_current_club()
    player = get_current_player()
    
    if not club or not player:
        return jsonify({'success': False, 'error': 'Invalid session'})
    
    # Get all games for this club
    games = Game.query.filter_by(club_id=club.id).all()
    
    # Calculate comprehensive stats for each member
    member_stats = {}
    
    for member in club.members:
        stats = {
            'name': member.name,
            'total_games': member.games_played,
            'total_wins': member.games_won,
            'total_losses': member.games_played - member.games_won,
            'win_rate': member.get_win_rate(),
            'elo': member.elo,
            'partner_stats': {},
            'opponent_stats': {},
            'scores': {
                'points_scored': 0,
                'points_conceded': 0,
                'avg_points_scored': 0,
                'avg_points_conceded': 0,
                'highest_score': 0,
                'lowest_score': 100
            }
        }
        
        # Analyze each game
        for game in games:
            players_in_game = [
                game.team1_player1, game.team1_player2,
                game.team2_player1, game.team2_player2
            ]
            
            if member.name not in players_in_game:
                continue
            
            # Determine which team the member was on
            on_team1 = member.name in [game.team1_player1, game.team1_player2]
            won_game = (on_team1 and game.winner == 1) or (not on_team1 and game.winner == 2)
            
            # Get partner
            if on_team1:
                partner = game.team1_player2 if member.name == game.team1_player1 else game.team1_player1
                opponents = [game.team2_player1, game.team2_player2]
                score_for = game.team1_score
                score_against = game.team2_score
            else:
                partner = game.team2_player2 if member.name == game.team2_player1 else game.team2_player1
                opponents = [game.team1_player1, game.team1_player2]
                score_for = game.team2_score
                score_against = game.team1_score
            
            # Update partner stats
            if partner not in stats['partner_stats']:
                stats['partner_stats'][partner] = {
                    'games': 0,
                    'wins': 0,
                    'losses': 0,
                    'win_rate': 0
                }
            
            stats['partner_stats'][partner]['games'] += 1
            if won_game:
                stats['partner_stats'][partner]['wins'] += 1
            else:
                stats['partner_stats'][partner]['losses'] += 1
            
            # Update opponent stats
            for opponent in opponents:
                if opponent not in stats['opponent_stats']:
                    stats['opponent_stats'][opponent] = {
                        'games': 0,
                        'wins': 0,
                        'losses': 0,
                        'win_rate': 0
                    }
                
                stats['opponent_stats'][opponent]['games'] += 1
                if won_game:
                    stats['opponent_stats'][opponent]['wins'] += 1
                else:
                    stats['opponent_stats'][opponent]['losses'] += 1
            
            # Update score stats
            stats['scores']['points_scored'] += score_for
            stats['scores']['points_conceded'] += score_against
            stats['scores']['highest_score'] = max(stats['scores']['highest_score'], score_for)
            stats['scores']['lowest_score'] = min(stats['scores']['lowest_score'], score_for)
        
        # Calculate averages
        if member.games_played > 0:
            stats['scores']['avg_points_scored'] = round(stats['scores']['points_scored'] / member.games_played, 1)
            stats['scores']['avg_points_conceded'] = round(stats['scores']['points_conceded'] / member.games_played, 1)
        
        # Calculate win rates for partners and opponents
        for partner_name, partner_data in stats['partner_stats'].items():
            if partner_data['games'] > 0:
                partner_data['win_rate'] = round((partner_data['wins'] / partner_data['games']) * 100, 1)
        
        for opponent_name, opponent_data in stats['opponent_stats'].items():
            if opponent_data['games'] > 0:
                opponent_data['win_rate'] = round((opponent_data['wins'] / opponent_data['games']) * 100, 1)
        
        member_stats[member.name] = stats
    
    return jsonify({
        'success': True,
        'club_name': club.name,
        'total_members': len(club.members),
        'total_games': len(games),
        'member_stats': member_stats
    })

@app.route('/api/tournaments', methods=['GET'])
@login_required
@subscription_required('tournament_mode')
def get_tournaments():
    club = get_current_club()
    tournaments = Tournament.query.filter_by(club_id=club.id).order_by(Tournament.created_at.desc()).all()
    
    tournaments_data = []
    for t in tournaments:
        tournaments_data.append({
            'id': t.id,
            'name': t.name,
            'status': t.status,
            'num_groups': t.num_groups,
            'knockout_rounds': t.knockout_rounds,
            'current_stage': t.current_stage,
            'num_teams': len(t.get_teams()),
            'created_at': t.created_at.strftime('%Y-%m-%d')
        })
    
    return jsonify({'success': True, 'tournaments': tournaments_data})

@app.route('/api/tournament/create', methods=['POST'])
@login_required
@subscription_required('tournament_mode')
def create_tournament():
    club = get_current_club()
    data = request.get_json()
    
    tournament = Tournament(
        club_id=club.id,
        name=data.get('name'),
        num_groups=int(data.get('num_groups', 2)),
        knockout_rounds=int(data.get('knockout_rounds', 2))
    )
    
    # Create teams from selected members
    teams = []
    for team_data in data.get('teams', []):
        teams.append({
            'id': len(teams),
            'player1': team_data['player1'],
            'player2': team_data['player2'],
            'name': f"{team_data['player1']} & {team_data['player2']}"
        })
    
    tournament.set_teams(teams)
    
    # Assign teams to groups
    groups = {}
    for i in range(tournament.num_groups):
        groups[f'Group {chr(65+i)}'] = []
    
    # Distribute teams evenly across groups
    for idx, team in enumerate(teams):
        group_name = f'Group {chr(65 + (idx % tournament.num_groups))}'
        groups[group_name].append(team['id'])
    
    tournament.set_groups(groups)
    tournament.status = 'group_stage'
    
    db.session.add(tournament)
    db.session.commit()
    
    return jsonify({'success': True, 'tournament_id': tournament.id})

@app.route('/api/tournament/<int:tournament_id>', methods=['GET'])
@login_required
@subscription_required('tournament_mode')
def get_tournament(tournament_id):
    club = get_current_club()
    tournament = Tournament.query.filter_by(id=tournament_id, club_id=club.id).first()
    
    if not tournament:
        return jsonify({'success': False, 'error': 'Tournament not found'})
    
    return jsonify({
        'success': True,
        'tournament': {
            'id': tournament.id,
            'name': tournament.name,
            'status': tournament.status,
            'num_groups': tournament.num_groups,
            'knockout_rounds': tournament.knockout_rounds,
            'current_stage': tournament.current_stage,
            'teams': tournament.get_teams(),
            'groups': tournament.get_groups(),
            'group_results': tournament.get_group_results(),
            'knockout_bracket': tournament.get_knockout_bracket()
        }
    })

@app.route('/api/tournament/<int:tournament_id>/record_match', methods=['POST'])
@login_required
@subscription_required('tournament_mode')
def record_tournament_match(tournament_id):
    club = get_current_club()
    tournament = Tournament.query.filter_by(id=tournament_id, club_id=club.id).first()
    
    if not tournament:
        return jsonify({'success': False, 'error': 'Tournament not found'})
    
    data = request.get_json()
    team1_id = data.get('team1_id')
    team2_id = data.get('team2_id')
    sets = data.get('sets', [])  # Array of {team1_score, team2_score}
    stage = data.get('stage', 'group')
    
    teams = tournament.get_teams()
    team1 = next((t for t in teams if t['id'] == team1_id), None)
    team2 = next((t for t in teams if t['id'] == team2_id), None)
    
    if not team1 or not team2:
        return jsonify({'success': False, 'error': 'Teams not found'})
    
    # Calculate match winner (best of sets)
    team1_sets_won = sum(1 for s in sets if s['team1_score'] > s['team2_score'])
    team2_sets_won = sum(1 for s in sets if s['team2_score'] > s['team1_score'])
    
    if team1_sets_won == team2_sets_won:
        return jsonify({'success': False, 'error': 'Match must have a winner'})
    
    # Record each set as a game for ELO purposes
    for set_data in sets:
        game = Game(
            club_id=club.id,
            team1_player1=team1['player1'],
            team1_player2=team1['player2'],
            team2_player1=team2['player1'],
            team2_player2=team2['player2'],
            team1_score=set_data['team1_score'],
            team2_score=set_data['team2_score'],
            winner=1 if set_data['team1_score'] > set_data['team2_score'] else 2,
            court=f'Tournament: {tournament.name}'
        )
        db.session.add(game)
        update_player_stats_and_elo(game)
    
    # Update tournament standings
    if stage == 'group':
        group_results = tournament.get_group_results()
        
        # Initialize team stats if not exists
        for tid in [team1_id, team2_id]:
            if str(tid) not in group_results:
                group_results[str(tid)] = {
                    'played': 0,
                    'won': 0,
                    'lost': 0,
                    'points_for': 0,
                    'points_against': 0,
                    'points': 0
                }
        
        # Update stats with total points from all sets
        total_team1_score = sum(s['team1_score'] for s in sets)
        total_team2_score = sum(s['team2_score'] for s in sets)
        
        group_results[str(team1_id)]['played'] += 1
        group_results[str(team2_id)]['played'] += 1
        group_results[str(team1_id)]['points_for'] += total_team1_score
        group_results[str(team1_id)]['points_against'] += total_team2_score
        group_results[str(team2_id)]['points_for'] += total_team2_score
        group_results[str(team2_id)]['points_against'] += total_team1_score
        
        if team1_sets_won > team2_sets_won:
            group_results[str(team1_id)]['won'] += 1
            group_results[str(team1_id)]['points'] += 2
            group_results[str(team2_id)]['lost'] += 1
        else:
            group_results[str(team2_id)]['won'] += 1
            group_results[str(team2_id)]['points'] += 2
            group_results[str(team1_id)]['lost'] += 1
        
        tournament.set_group_results(group_results)
    
    elif stage == 'knockout':
        # Update knockout bracket
        bracket = tournament.get_knockout_bracket()
        match_id = data.get('match_id')
        winner_id = team1_id if team1_sets_won > team2_sets_won else team2_id
        
        # Find and update the match
        for round_idx, round_matches in enumerate(bracket['rounds']):
            for match in round_matches:
                if match['match_id'] == match_id:
                    match['sets'] = sets
                    match['winner_id'] = winner_id
                    
                    # Progress winner to next round
                    if round_idx < len(bracket['rounds']) - 1:
                        next_round = bracket['rounds'][round_idx + 1]
                        
                        # Calculate which match in next round
                        match_position = match_id - bracket['rounds'][round_idx][0]['match_id']
                        next_match_idx = match_position // 2
                        
                        if next_match_idx < len(next_round):
                            next_match = next_round[next_match_idx]
                            
                            # Determine if winner goes to team1 or team2 slot
                            if match_position % 2 == 0:
                                next_match['team1_id'] = winner_id
                            else:
                                next_match['team2_id'] = winner_id
                    else:
                        # This was the final - tournament complete
                        tournament.status = 'completed'
                    
                    break
        
        tournament.set_knockout_bracket(bracket)
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Match recorded successfully'})

@app.route('/api/tournament/<int:tournament_id>/advance_stage', methods=['POST'])
@login_required
@subscription_required('tournament_mode')
def advance_tournament_stage(tournament_id):
    club = get_current_club()
    tournament = Tournament.query.filter_by(id=tournament_id, club_id=club.id).first()
    
    if not tournament:
        return jsonify({'success': False, 'error': 'Tournament not found'})
    
    if tournament.current_stage == 'groups':
        # Generate knockout bracket from group winners
        group_results = tournament.get_group_results()
        groups = tournament.get_groups()
        teams = tournament.get_teams()
        
        # Get top teams from each group
        qualified_teams = []
        for group_name, team_ids in groups.items():
            # Sort teams by points, then goal difference
            group_standings = []
            for team_id in team_ids:
                stats = group_results.get(str(team_id), {})
                goal_diff = stats.get('points_for', 0) - stats.get('points_against', 0)
                group_standings.append({
                    'team_id': team_id,
                    'points': stats.get('points', 0),
                    'goal_diff': goal_diff
                })
            
            group_standings.sort(key=lambda x: (x['points'], x['goal_diff']), reverse=True)
            
            # Top 2 from each group qualify (or adjust based on tournament size)
            qualified_teams.extend([s['team_id'] for s in group_standings[:2]])
        
        # Create complete knockout bracket with all rounds
        bracket = create_knockout_bracket(qualified_teams, tournament.knockout_rounds)
        
        tournament.set_knockout_bracket(bracket)
        tournament.current_stage = 'knockout'
        tournament.status = 'knockout'
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Advanced to knockout stage'})
    
    return jsonify({'success': False, 'error': 'Cannot advance stage'})

def create_knockout_bracket(qualified_teams, num_rounds):
    """
    Create a complete knockout bracket structure
    num_rounds: 1 = Final only, 2 = Semis + Final, 3 = Quarters + Semis + Final
    """
    bracket = {'rounds': []}
    
    # Calculate number of teams needed for the bracket
    # For num_rounds=3: 8 teams (quarters), num_rounds=2: 4 teams (semis), num_rounds=1: 2 teams (final)
    teams_needed = 2 ** num_rounds
    
    # Pad or trim qualified teams to fit bracket
    if len(qualified_teams) < teams_needed:
        # Add byes if needed (represented as None)
        qualified_teams = qualified_teams + [None] * (teams_needed - len(qualified_teams))
    elif len(qualified_teams) > teams_needed:
        qualified_teams = qualified_teams[:teams_needed]
    
    # Create first round matches
    first_round = []
    match_id = 0
    for i in range(0, len(qualified_teams), 2):
        first_round.append({
            'match_id': match_id,
            'round': 0,
            'team1_id': qualified_teams[i],
            'team2_id': qualified_teams[i + 1] if i + 1 < len(qualified_teams) else None,
            'winner_id': None,
            'sets': []
        })
        match_id += 1
    
    bracket['rounds'].append(first_round)
    
    # Create subsequent rounds with placeholder teams
    for round_num in range(1, num_rounds):
        num_matches = 2 ** (num_rounds - round_num - 1)
        round_matches = []
        
        for i in range(num_matches):
            round_matches.append({
                'match_id': match_id,
                'round': round_num,
                'team1_id': None,
                'team2_id': None,
                'winner_id': None,
                'sets': []
            })
            match_id += 1
        
        bracket['rounds'].append(round_matches)
    
    return bracket

@app.route('/api/create-checkout-session', methods=['POST'])
@login_required
def create_checkout_session():
    club = get_current_club()
    player = get_current_player()
    
    if not club or not player or player.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin access required'})
    
    data = request.get_json()
    tier = data.get('tier')
    
    # Map tier to Stripe price ID
    price_id = None
    if tier == 'pro':
        price_id = STRIPE_PRICE_PRO
    elif tier == 'elite':
        price_id = STRIPE_PRICE_ELITE
    else:
        return jsonify({'success': False, 'error': 'Invalid tier'})
    
    try:
        # Create or retrieve Stripe customer
        if not club.stripe_customer_id:
            customer = stripe.Customer.create(
                email=player.name + '@club.local',  # You might want to collect real emails
                metadata={
                    'club_id': club.id,
                    'club_name': club.name,
                    'club_code': club.code
                }
            )
            club.stripe_customer_id = customer.id
            db.session.commit()
        
        # Create Checkout Session
        checkout_session = stripe.checkout.Session.create(
            customer=club.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=DOMAIN + '/dashboard?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=DOMAIN + '/dashboard?canceled=true',
            metadata={
                'club_id': club.id,
                'tier': tier
            }
        )
        
        return jsonify({
            'success': True,
            'checkout_url': checkout_session.url,
            'session_id': checkout_session.id
        })
        
    except Exception as e:
        print(f"Stripe error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/create-portal-session', methods=['POST'])
@login_required
def create_portal_session():
    """Allow customers to manage their subscription"""
    club = get_current_club()
    player = get_current_player()
    
    if not club or not player or player.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin access required'})
    
    if not club.stripe_customer_id:
        return jsonify({'success': False, 'error': 'No subscription found'})
    
    try:
        session = stripe.billing_portal.Session.create(
            customer=club.stripe_customer_id,
            return_url=DOMAIN + '/dashboard',
        )
        
        return jsonify({'success': True, 'url': session.url})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhooks"""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    
    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_checkout_completed(session)
    
    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        handle_subscription_updated(subscription)
    
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        handle_subscription_deleted(subscription)
    
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        handle_payment_failed(invoice)
    
    return jsonify({'success': True})

def handle_checkout_completed(session):
    """Upgrade club when checkout completes"""
    club_id = session['metadata'].get('club_id')
    tier = session['metadata'].get('tier')
    
    if club_id and tier:
        club = Club.query.get(int(club_id))
        if club:
            club.subscription_tier = tier
            club.stripe_subscription_id = session.get('subscription')
            db.session.commit()
            print(f"Club {club.code} upgraded to {tier}")

def handle_subscription_updated(subscription):
    """Handle subscription changes"""
    customer_id = subscription['customer']
    club = Club.query.filter_by(stripe_customer_id=customer_id).first()
    
    if club:
        # Determine tier from subscription items
        if subscription['items']['data']:
            price_id = subscription['items']['data'][0]['price']['id']
            
            if price_id == STRIPE_PRICE_PRO:
                club.subscription_tier = 'pro'
            elif price_id == STRIPE_PRICE_ELITE:
                club.subscription_tier = 'elite'
            
            db.session.commit()
            print(f"Club {club.code} subscription updated to {club.subscription_tier}")

def handle_subscription_deleted(subscription):
    """Downgrade club when subscription cancelled"""
    customer_id = subscription['customer']
    club = Club.query.filter_by(stripe_customer_id=customer_id).first()
    
    if club:
        club.subscription_tier = 'free'
        club.stripe_subscription_id = None
        db.session.commit()
        print(f"Club {club.code} downgraded to free")

def handle_payment_failed(invoice):
    """Handle failed payments"""
    customer_id = invoice['customer']
    club = Club.query.filter_by(stripe_customer_id=customer_id).first()
    
    if club:
        print(f"Payment failed for club {club.code}")
        # You might want to send an email notification here

# Update database URI for production
if os.getenv('DATABASE_URL'):
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL').replace('postgres://', 'postgresql://')
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///badminton.db'

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)