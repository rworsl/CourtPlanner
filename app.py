from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date
import os
import secrets
import json
from sqlalchemy import func, desc

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(16))
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///badminton.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Models
class Club(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    courts = db.Column(db.Integer, default=4)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    members = db.relationship('Member', backref='club', lazy=True, cascade='all, delete-orphan')
    games = db.relationship('Game', backref='club', lazy=True, cascade='all, delete-orphan')

class Member(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    elo = db.Column(db.Integer, default=1200)
    games_played = db.Column(db.Integer, default=0)
    games_won = db.Column(db.Integer, default=0)
    role = db.Column(db.String(20), default='member')  # 'admin' or 'member'
    partner_stats = db.Column(db.Text, default='{}')  # JSON string
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# Helper functions
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'club_code' not in session or 'player_name' not in session:
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
    
    # Update ELO ratings
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

# Routes
@app.route('/')
def index():
    if 'club_code' in session and 'player_name' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

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
    
    if Club.query.filter_by(code=club_code).first():
        return jsonify({'success': False, 'error': 'Club code already exists. Please choose a different code.'})
    
    # Create club
    club = Club(code=club_code, name=club_name)
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
    
    return jsonify({
        'success': True,
        'club': {
            'name': club.name,
            'code': club.code,
            'courts': club.courts,
            'total_members': len(club.members),
            'games_played': len(club.games)
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
        'is_admin': is_current_player_admin()
    })

@app.route('/api/add_member', methods=['POST'])
@login_required
@admin_required
def add_member():
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'success': False, 'error': 'Please enter a member name'})
    
    club = get_current_club()
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
    members = Member.query.filter_by(club_id=club.id).order_by(desc(Member.elo)).all()
    
    rankings_data = []
    for i, member in enumerate(members):
        rankings_data.append({
            'rank': i + 1,
            'name': member.name,
            'elo': member.elo,
            'games_played': member.games_played,
            'games_won': member.games_won,
            'win_rate': member.get_win_rate()
        })
    
    return jsonify({
        'success': True,
        'rankings': rankings_data
    })

@app.route('/api/match_suggestions')
@login_required
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
                        
                        team1_elo = (team1[0].elo + team1[1].elo) / 2
                        team2_elo = (team2[0].elo + team2[1].elo) / 2
                        balance = abs(team1_elo - team2_elo)
                        
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
        db.create_all()
        
        # Create demo club if it doesn't exist
        if not Club.query.filter_by(code='DEMO123').first():
            create_demo_data()

def create_demo_data():
    """Create demo club with sample data"""
    club = Club(code='DEMO123', name='Ace Badminton Club', courts=4)
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

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)