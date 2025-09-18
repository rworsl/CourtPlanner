// Global variables
let clubInfo = null;
let membersList = [];
let activePlayers = [];
let courtAssignments = {};
let currentSection = 'dashboard';
let isAdmin = false;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadClubInfo();
    showSection('dashboard');
});

// API helper function
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        return { success: false, error: 'Network error' };
    }
}

// Load club info
async function loadClubInfo() {
    const data = await apiRequest('/api/club_info');
    if (data.success) {
        clubInfo = data.club;
        playerInfo = data.player;
        isAdmin = data.player.role === 'admin';
        updateClubHeader();
        updateDashboard();
    }
}

// Update club header
function updateClubHeader() {
    if (clubInfo && playerInfo) {
        const roleText = playerInfo.role === 'admin' ? ' (Administrator)' : '';
        document.getElementById('clubTitle').textContent = `🏸 ${clubInfo.name}`;
        document.getElementById('welcomeMessage').textContent = `Welcome back, ${playerInfo.name}${roleText}!`;
    }
}

// Navigation
function showSection(sectionName) {
    currentSection = sectionName;
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const targetTab = Array.from(document.querySelectorAll('.nav-tab')).find(tab => 
        tab.textContent.toLowerCase().includes(sectionName.toLowerCase())
    );
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Load section-specific data
    switch(sectionName) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadMembers().then(() => {
                updateActivePlayersSelection();
                updateCourts();
            });
            break;
        case 'games':
            loadGames();
            loadMembers();
            break;
        case 'rankings':
            loadRankings();
            break;
    }
}

// Dashboard functions
async function updateDashboard() {
    if (clubInfo && playerInfo) {
        document.getElementById('totalMembers').textContent = clubInfo.total_members;
        document.getElementById('activeCourts').textContent = clubInfo.courts;
        document.getElementById('gamesPlayed').textContent = clubInfo.games_played;
        document.getElementById('yourElo').textContent = playerInfo.elo;
    }
    
    await loadMatchSuggestions();
}

async function loadMatchSuggestions() {
    const data = await apiRequest('/api/match_suggestions');
    if (data.success) {
        const container = document.getElementById('matchSuggestions');
        if (data.suggestions.length === 0) {
            container.innerHTML = `<p style="color: #7f8c8d; font-style: italic;">${data.message || 'No suggestions available'}</p>`;
        } else {
            container.innerHTML = data.suggestions.map(suggestion => `
                <div class="suggestion-item">
                    <div>
                        <strong>${suggestion.team1.join(' & ')}</strong> 
                        vs 
                        <strong>${suggestion.team2.join(' & ')}</strong>
                    </div>
                    <div class="balance-score">Balance: ${suggestion.balance}</div>
                </div>
            `).join('');
        }
    }
}

// Members functions
async function loadMembers() {
    const data = await apiRequest('/api/members');
    if (data.success) {
        membersList = data.members;
        isAdmin = data.is_admin;
        updateMembersList();
        updateGameSelects();
    }
}

function updateMembersList() {
    const container = document.getElementById('membersList');
    const adminInfoDiv = document.getElementById('membersAdminInfo');
    
    if (adminInfoDiv) {
        adminInfoDiv.innerHTML = isAdmin ? 
            '<p style="color: #7f8c8d; margin-bottom: 15px; font-size: 14px;">As an administrator, you can add/remove members and manage admin privileges.</p>' : 
            '<p style="color: #7f8c8d; margin-bottom: 15px; font-size: 14px;">Member management is handled by club administrators.</p>';
    }
    
    const nameInput = document.getElementById('newMemberName');
    const addButton = nameInput.nextElementSibling;
    if (nameInput && addButton) {
        nameInput.disabled = !isAdmin;
        addButton.disabled = !isAdmin;
    }
    
    container.innerHTML = membersList.map(member => {
        const roleDisplay = member.role === 'admin' ? 
            '<span style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; text-transform: uppercase; font-weight: 600;">ADMIN</span>' : 
            '<span style="background: #ecf0f1; color: #7f8c8d; padding: 2px 8px; border-radius: 10px; font-size: 10px; text-transform: uppercase; font-weight: 600;">MEMBER</span>';

        return `
            <div class="player-card">
                <div class="player-header">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <div class="player-name">${member.name}</div>
                        ${roleDisplay}
                    </div>
                    <div class="elo-rating">ELO: ${member.elo}</div>
                </div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-label">Games Played</div>
                        <div class="stat-value">${member.games_played}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Win Rate</div>
                        <div class="stat-value">${member.win_rate.toFixed(1)}%</div>
                    </div>
                </div>
                <div style="margin-top: 10px;">
                    <div class="stat-label">Partner Stats:</div>
                    <div style="font-size: 12px; color: #666;">${member.partner_stats}</div>
                </div>
                ${isAdmin && member.name !== playerInfo.name ? `
                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                        ${member.role === 'member' ? `
                            <button onclick="promoteToAdmin('${member.name}')" style="flex: 1; font-size: 12px; padding: 8px;" class="btn-secondary">
                                Promote to Admin
                            </button>
                        ` : `
                            <button onclick="demoteToMember('${member.name}')" style="flex: 1; font-size: 12px; padding: 8px;" class="btn-secondary">
                                Demote to Member
                            </button>
                        `}
                        <button class="btn-danger" onclick="removeMember('${member.name}')" style="flex: 1; font-size: 12px; padding: 8px;">
                            Remove Member
                        </button>
                    </div>
                ` : member.name !== playerInfo.name && !isAdmin ? `
                    <div style="margin-top: 15px; color: #7f8c8d; font-size: 12px; text-align: center;">
                        Only admins can manage members
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function addMember() {
    if (!isAdmin) {
        showError('memberError', 'Only club administrators can add new members');
        return;
    }

    const nameInput = document.getElementById('newMemberName');
    const name = nameInput.value.trim();
    
    clearMessages();

    if (!name) {
        showError('memberError', 'Please enter a member name');
        return;
    }

    const data = await apiRequest('/api/add_member', 'POST', { name: name });
    
    if (data.success) {
        nameInput.value = '';
        showSuccess('memberSuccess', data.message);
        loadMembers();
    } else {
        showError('memberError', data.error);
    }
}

async function removeMember(memberName) {
    if (!isAdmin) {
        alert('Only club administrators can remove members');
        return;
    }

    if (memberName === playerInfo.name) {
        alert('You cannot remove yourself from the club');
        return;
    }

    if (confirm(`Are you sure you want to remove ${memberName}?`)) {
        const data = await apiRequest('/api/remove_member', 'POST', { member_name: memberName });
        
        if (data.success) {
            alert(data.message);
            loadMembers();
        } else {
            alert(data.error);
        }
    }
}

async function promoteToAdmin(memberName) {
    if (!isAdmin) {
        alert('Only club administrators can promote members');
        return;
    }

    const data = await apiRequest('/api/promote_member', 'POST', { member_name: memberName });
    
    if (data.success) {
        alert(data.message);
        loadMembers();
    } else {
        alert(data.error);
    }
}

async function demoteToMember(memberName) {
    if (!isAdmin) {
        alert('Only club administrators can demote members');
        return;
    }

    const data = await apiRequest('/api/demote_member', 'POST', { member_name: memberName });
    
    if (data.success) {
        alert(data.message);
        loadMembers();
    } else {
        alert(data.error);
    }
}

// Court management
function updateActivePlayersSelection() {
    const container = document.getElementById('activePlayersSelection');
    if (!membersList.length) return;
    
    container.innerHTML = membersList.map(member => `
        <div class="player-checkbox ${activePlayers.includes(member.name) ? 'selected' : ''}" 
             onclick="toggleActivePlayer('${member.name}')">
            <input type="checkbox" ${activePlayers.includes(member.name) ? 'checked' : ''} 
                   onchange="toggleActivePlayer('${member.name}')" />
            <label>${member.name}</label>
            <span style="margin-left: auto; font-size: 12px; color: #666;">ELO: ${member.elo}</span>
        </div>
    `).join('');
    
    updateActivePlayersDisplay();
}

function toggleActivePlayer(playerName) {
    const index = activePlayers.indexOf(playerName);
    if (index > -1) {
        activePlayers.splice(index, 1);
    } else {
        activePlayers.push(playerName);
    }
    updateActivePlayersSelection();
    updateCourts();
}

function selectAllPlayers() {
    activePlayers = membersList.map(m => m.name);
    updateActivePlayersSelection();
    updateCourts();
}

function clearAllPlayers() {
    activePlayers = [];
    updateActivePlayersSelection();
    updateCourts();
}

function updateActivePlayersDisplay() {
    document.getElementById('activePlayersCount').textContent = activePlayers.length;
    document.getElementById('activePlayersNames').textContent = 
        activePlayers.length > 0 ? activePlayers.join(', ') : 'No players selected';
}

async function updateCourts() {
    const courtCount = parseInt(document.getElementById('courtCount').value);
    const data = await apiRequest('/api/update_courts', 'POST', { court_count: courtCount });
    updateCourtsWithAssignments();
}

function updateCourtsWithAssignments() {
    const courtCount = parseInt(document.getElementById('courtCount').value);
    const container = document.getElementById('courtsContainer');
    container.innerHTML = '';
    
    for (let i = 1; i <= courtCount; i++) {
        const courtDiv = document.createElement('div');
        courtDiv.className = 'court';
        
        const assignment = courtAssignments[i];
        if (assignment && assignment.team1 && assignment.team2) {
            const team1Elo = Math.round((assignment.team1[0].elo + assignment.team1[1].elo) / 2);
            const team2Elo = Math.round((assignment.team2[0].elo + assignment.team2[1].elo) / 2);
            const balance = Math.abs(team1Elo - team2Elo);
            
            courtDiv.innerHTML = `
                <h3>Court ${i}</h3>
                <div class="court-assignment occupied">
                    <div class="teams">
                        <div class="team">
                            <div class="team-name">${assignment.team1[0].name}</div>
                            <div class="team-name">${assignment.team1[1].name}</div>
                            <div class="team-elo">Avg ELO: ${team1Elo}</div>
                        </div>
                        <div class="vs" style="font-size: 18px; font-weight: bold; color: #ff6b6b;">VS</div>
                        <div class="team">
                            <div class="team-name">${assignment.team2[0].name}</div>
                            <div class="team-name">${assignment.team2[1].name}</div>
                            <div class="team-elo">Avg ELO: ${team2Elo}</div>
                        </div>
                    </div>
                    <div class="match-info">
                        <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 5px 10px; border-radius: 15px; display: inline-block; font-size: 12px; margin-bottom: 15px; font-weight: 600;">
                            Balance Score: ${balance}
                        </div>
                    </div>
                    
                    <div class="score-entry">
                        <h4>Enter Match Score</h4>
                        <div class="score-teams">
                            <div class="score-team">
                                <div class="score-team-name">${assignment.team1[0].name} & ${assignment.team1[1].name}</div>
                                <input type="number" id="court${i}Team1Score" min="0" max="50" value="0">
                            </div>
                            <div style="font-size: 18px; font-weight: bold; color: #666;">-</div>
                            <div class="score-team">
                                <div class="score-team-name">${assignment.team2[0].name} & ${assignment.team2[1].name}</div>
                                <input type="number" id="court${i}Team2Score" min="0" max="50" value="0">
                            </div>
                        </div>
                        <div style="text-align: center; font-size: 12px; color: #666; margin: 8px 0;">
                            Standard badminton: First to 21 points (must win by 2)
                        </div>
                        <div id="court${i}ScoreError" class="error" style="text-align: center; margin-top: 10px;"></div>
                    </div>
                    
                    <div class="court-actions">
                        <button onclick="recordCourtScore(${i})" class="btn-secondary" style="flex: 2;">
                            Record & Finish Match
                        </button>
                        <button onclick="clearCourt(${i})" class="btn-danger" style="flex: 1;">
                            Clear Court
                        </button>
                    </div>
                </div>
            `;
        } else {
            courtDiv.innerHTML = `
                <h3>Court ${i}</h3>
                <div class="court-assignment" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div class="match-info">
                        <div style="color: #666; font-style: italic; margin-bottom: 15px;">Court Available</div>
                    </div>
                    <button onclick="assignBestMatch(${i})" ${activePlayers.length < 4 ? 'disabled' : ''}>
                        ${activePlayers.length < 4 ? 'Need 4+ Active Players' : 'Assign Best Match'}
                    </button>
                </div>
            `;
        }
        container.appendChild(courtDiv);
    }
}

function assignBestMatch(courtNumber) {
    if (activePlayers.length < 4) {
        alert('Need at least 4 active players to assign a match');
        return;
    }

    const availablePlayers = getAvailablePlayers();
    if (availablePlayers.length < 4) {
        alert('Need at least 4 available players (not currently playing)');
        return;
    }

    const bestMatch = findBestMatch(availablePlayers);
    if (bestMatch) {
        courtAssignments[courtNumber] = bestMatch;
        updateCourtsWithAssignments();
    }
}

function clearCourt(courtNumber) {
    delete courtAssignments[courtNumber];
    updateCourtsWithAssignments();
}

function generateAllMatches() {
    if (activePlayers.length < 4) {
        alert('Need at least 4 active players to generate matches');
        return;
    }

    clearAllCourts();
    
    const courtCount = parseInt(document.getElementById('courtCount').value);
    
    for (let i = 1; i <= courtCount; i++) {
        const availablePlayers = getAvailablePlayers();
        if (availablePlayers.length >= 4) {
            const bestMatch = findBestMatch(availablePlayers);
            if (bestMatch) {
                courtAssignments[i] = bestMatch;
            }
        }
    }
    
    updateCourtsWithAssignments();
}

function getAvailablePlayers() {
    const currentlyPlaying = [];
    
    Object.values(courtAssignments).forEach(assignment => {
        if (assignment && assignment.team1 && assignment.team2) {
            currentlyPlaying.push(...assignment.team1.map(p => p.name));
            currentlyPlaying.push(...assignment.team2.map(p => p.name));
        }
    });

    return membersList.filter(member => 
        activePlayers.includes(member.name) && 
        !currentlyPlaying.includes(member.name)
    );
}

function findBestMatch(availablePlayers) {
    if (availablePlayers.length < 4) return null;

    const suggestions = [];

    // Generate all possible team combinations
    for (let i = 0; i < availablePlayers.length; i++) {
        for (let j = i + 1; j < availablePlayers.length; j++) {
            for (let k = 0; k < availablePlayers.length; k++) {
                for (let l = k + 1; l < availablePlayers.length; l++) {
                    if (k !== i && k !== j && l !== i && l !== j) {
                        const team1 = [availablePlayers[i], availablePlayers[j]];
                        const team2 = [availablePlayers[k], availablePlayers[l]];
                        const balance = calculateMatchBalance(team1, team2);
                        suggestions.push({ team1, team2, balance });
                    }
                }
            }
        }
    }

    // Sort by balance (lower is better) and return the most balanced match
    suggestions.sort((a, b) => a.balance - b.balance);
    return suggestions[0] || null;
}

function calculateMatchBalance(team1, team2) {
    const team1Elo = (team1[0].elo + team1[1].elo) / 2;
    const team2Elo = (team2[0].elo + team2[1].elo) / 2;
    return Math.abs(team1Elo - team2Elo);
}

function clearAllCourts() {
    courtAssignments = {};
    updateCourts();
}

// Games functions
async function loadGames() {
    const data = await apiRequest('/api/games');
    if (data.success) {
        updateRecentGames(data.games);
        updateGamesAdminInfo();
    }
}

function updateGamesAdminInfo() {
    const adminInfoDiv = document.getElementById('gamesAdminInfo');
    if (adminInfoDiv) {
        adminInfoDiv.innerHTML = isAdmin ? 
            '<p style="color: #7f8c8d; margin-bottom: 15px; font-size: 14px;">As an administrator, you can edit scores or delete games using the buttons below each match.</p>' : 
            '<p style="color: #7f8c8d; margin-bottom: 15px; font-size: 14px;">Game history is managed by club administrators.</p>';
    }
}

function updateGameSelects() {
    const selects = ['team1Player1', 'team1Player2', 'team2Player1', 'team2Player2'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select Player</option>' + 
                membersList.map(member => `<option value="${member.name}">${member.name}</option>`).join('');
        }
    });
}

function updateRecentGames(games) {
    const container = document.getElementById('recentGames');
    
    if (!games.length) {
        container.innerHTML = '<p>No games recorded yet.</p>';
        return;
    }
    
    container.innerHTML = games.map(game => `
        <div class="match" style="margin-bottom: 15px;" id="game-${game.id}">
            <div class="match-players">
                <div class="team">
                    ${game.team1.join(' & ')}<br>
                    <strong>Score: <span id="game-${game.id}-team1-score">${game.score[0]}</span></strong>
                </div>
                <div class="vs">VS</div>
                <div class="team">
                    ${game.team2.join(' & ')}<br>
                    <strong>Score: <span id="game-${game.id}-team2-score">${game.score[1]}</span></strong>
                </div>
            </div>
            <div style="text-align: center; margin-top: 10px;">
                <span style="background: ${game.winner === 1 ? '#27ae60' : '#f39c12'}; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: 600;">
                    Winner: ${game.winner === 1 ? 'Team 1' : 'Team 2'}
                </span>
                <div style="font-size: 12px; color: #7f8c8d; margin-top: 5px;">
                    ${game.date}${game.time ? ` at ${game.time}` : ''}
                    ${game.court && game.court !== 'Manual Entry' ? ` • Court ${game.court}` : ''}
                </div>
                ${isAdmin ? `
                    <div style="margin-top: 10px; display: flex; gap: 10px; justify-content: center;">
                        <button onclick="editGame(${game.id})" style="background: #f39c12; padding: 5px 10px; font-size: 11px; border-radius: 5px;" id="edit-btn-${game.id}">
                            Edit Score
                        </button>
                        <button onclick="deleteGame(${game.id})" style="background: #e74c3c; padding: 5px 10px; font-size: 11px; border-radius: 5px;">
                            Delete Game
                        </button>
                    </div>
                    <div id="edit-form-${game.id}" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                        <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
                            <input type="number" id="edit-team1-${game.id}" value="${game.score[0]}" min="0" style="width: 60px; text-align: center;">
                            <span>-</span>
                            <input type="number" id="edit-team2-${game.id}" value="${game.score[1]}" min="0" style="width: 60px; text-align: center;">
                        </div>
                        <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                            <button onclick="saveGameEdit(${game.id})" style="background: #27ae60; padding: 5px 10px; font-size: 11px; border-radius: 5px;">
                                Save
                            </button>
                            <button onclick="cancelGameEdit(${game.id})" style="background: #95a5a6; padding: 5px 10px; font-size: 11px; border-radius: 5px;">
                                Cancel
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function recordGame() {
    const team1Player1 = document.getElementById('team1Player1').value;
    const team1Player2 = document.getElementById('team1Player2').value;
    const team2Player1 = document.getElementById('team2Player1').value;
    const team2Player2 = document.getElementById('team2Player2').value;
    const team1Score = parseInt(document.getElementById('team1Score').value);
    const team2Score = parseInt(document.getElementById('team2Score').value);
    
    clearMessages();

    if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
        showError('gameError', 'Please select all players');
        return;
    }

    if (isNaN(team1Score) || isNaN(team2Score)) {
        showError('gameError', 'Please enter valid scores');
        return;
    }

    const players = [team1Player1, team1Player2, team2Player1, team2Player2];
    if (new Set(players).size !== 4) {
        showError('gameError', 'All players must be different');
        return;
    }

    const data = await apiRequest('/api/record_game', 'POST', {
        team1_player1: team1Player1,
        team1_player2: team1Player2,
        team2_player1: team2Player1,
        team2_player2: team2Player2,
        team1_score: team1Score,
        team2_score: team2Score
    });
    
    if (data.success) {
        document.getElementById('team1Score').value = '';
        document.getElementById('team2Score').value = '';
        showSuccess('gameSuccess', data.message);
        loadGames();
        loadClubInfo(); // Refresh dashboard stats
    } else {
        showError('gameError', data.error);
    }
}

function editGame(gameId) {
    if (!isAdmin) {
        alert('Only club administrators can edit games');
        return;
    }

    document.getElementById(`edit-form-${gameId}`).style.display = 'block';
    document.getElementById(`edit-btn-${gameId}`).style.display = 'none';
}

function cancelGameEdit(gameId) {
    document.getElementById(`edit-form-${gameId}`).style.display = 'none';
    document.getElementById(`edit-btn-${gameId}`).style.display = 'inline-block';
}

async function saveGameEdit(gameId) {
    if (!isAdmin) {
        alert('Only club administrators can edit games');
        return;
    }

    const newTeam1Score = parseInt(document.getElementById(`edit-team1-${gameId}`).value);
    const newTeam2Score = parseInt(document.getElementById(`edit-team2-${gameId}`).value);

    if (isNaN(newTeam1Score) || isNaN(newTeam2Score)) {
        alert('Please enter valid scores');
        return;
    }

    if (newTeam1Score < 0 || newTeam2Score < 0) {
        alert('Scores cannot be negative');
        return;
    }

    if (newTeam1Score === newTeam2Score) {
        alert('Match cannot end in a tie');
        return;
    }

    const data = await apiRequest('/api/edit_game', 'POST', {
        game_id: gameId,
        team1_score: newTeam1Score,
        team2_score: newTeam2Score
    });
    
    if (data.success) {
        document.getElementById(`game-${gameId}-team1-score`).textContent = newTeam1Score;
        document.getElementById(`game-${gameId}-team2-score`).textContent = newTeam2Score;
        
        document.getElementById(`edit-form-${gameId}`).style.display = 'none';
        document.getElementById(`edit-btn-${gameId}`).style.display = 'inline-block';

        alert(data.message);
        loadClubInfo(); // Refresh dashboard stats
    } else {
        alert(data.error);
    }
}

async function deleteGame(gameId) {
    if (!isAdmin) {
        alert('Only club administrators can delete games');
        return;
    }

    if (!confirm('Are you sure you want to delete this game?')) {
        return;
    }

    const data = await apiRequest('/api/delete_game', 'POST', { game_id: gameId });
    
    if (data.success) {
        alert(data.message);
        loadGames();
        loadClubInfo(); // Refresh dashboard stats
    } else {
        alert(data.error);
    }
}

// Rankings functions
async function loadRankings() {
    const data = await apiRequest('/api/rankings');
    if (data.success) {
        updateRankingsList(data.rankings);
    }
}

function updateRankingsList(rankings) {
    const container = document.getElementById('rankingsList');
    
    container.innerHTML = `
        <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 15px;">
                <h3 style="margin: 0; font-weight: 600;">Club Leaderboard</h3>
            </div>
            <div style="padding: 0;">
                ${rankings.map((member, index) => {
                    const rankBadgeColor = index === 0 ? '#f1c40f' : index === 1 ? '#95a5a6' : index === 2 ? '#cd7f32' : '#ecf0f1';
                    const rankTextColor = index < 3 ? '#2c3e50' : '#7f8c8d';
                    
                    return `
                        <div style="display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid #ecf0f1; transition: background 0.2s ease;" 
                             onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                            <div style="background: ${rankBadgeColor}; color: ${rankTextColor}; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; margin-right: 15px; font-size: 14px;">
                                ${member.rank}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #2c3e50; margin-bottom: 2px;">${member.name}</div>
                                <div style="font-size: 12px; color: #7f8c8d;">
                                    ${member.games_played} games • ${member.games_won} wins • ${member.win_rate.toFixed(1)}% win rate
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="background: linear-gradient(135deg, #34495e, #2c3e50); color: #ecf0f1; padding: 4px 10px; border-radius: 15px; font-weight: 600; font-size: 12px; margin-bottom: 2px;">
                                    ${member.elo} ELO
                                </div>
                                <div style="font-size: 10px; color: #95a5a6; text-transform: uppercase; letter-spacing: 0.5px;">
                                    Rank #${member.rank}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Utility functions
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.color = '#f44336';
    }
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.color = '#4CAF50';
    }
}

function clearMessages() {
    const errorElements = document.querySelectorAll('.error');
    const successElements = document.querySelectorAll('.success');
    
    errorElements.forEach(el => el.textContent = '');
    successElements.forEach(el => el.textContent = '');
}

function logout() {
    window.location.href = '/logout';
}