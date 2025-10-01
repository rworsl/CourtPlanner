/**
 * Dashboard JavaScript - Complete Fixed Version
 */
let sessionGameCounts = {}; // Track games played per player this session
let sessionWins = {}; // Track wins per player this session
let currentActiveSection = 'overview';
let isRecordingScore = false; // Mutex to prevent concurrent operations

let currentClubData = null;
let currentPlayerData = null;
let activePlayers = [];
let allMembers = [];

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing...');
    initializeDashboard();
});

function initializeDashboard() {
    try {
        console.log('[initializeDashboard] Starting...');
        setupNavigation();
        setupForms();
        
        // Load initial data but DON'T force overview
        loadDashboardData().then(() => {
            console.log('[initializeDashboard] Initial data loaded');
            // Only load overview data if we're on overview
            if (currentActiveSection === 'overview') {
                loadOverviewData();
            }
        });
        
        console.log('[initializeDashboard] Completed');
    } catch (error) {
        console.error('[initializeDashboard] ERROR:', error);
        showAlert('Failed to initialize dashboard', 'danger');
    }
}

/**
 * Navigation and tab switching
 */
function setupNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    console.log('Found nav tabs:', navTabs.length);
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const sectionName = this.getAttribute('data-section');
            console.log('Tab clicked:', sectionName);
            showSection(sectionName);
        });
    });
}

function showSection(sectionName) {
    console.log('[showSection] Called with:', sectionName, 'isRecordingScore:', isRecordingScore);
    
    // If we're recording a score, ignore any section change requests
    if (isRecordingScore && sectionName !== 'courts') {
        console.log('[showSection] BLOCKED - Currently recording score');
        return;
    }
    
    // Store the current active section
    currentActiveSection = sectionName;
    console.log('[showSection] Setting currentActiveSection to:', currentActiveSection);
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Show selected section
    document.querySelectorAll('.dashboard-section').forEach(section => section.classList.remove('active'));
    const activeSection = document.getElementById(sectionName);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    // Load section-specific data
    loadSectionData(sectionName);
}

function loadSectionData(sectionName) {
    console.log('Loading data for section:', sectionName);
    switch(sectionName) {
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadCourtOrganization();
            break;
        case 'games':
            loadGames();
            loadMembersForForm();
            break;
        case 'rankings':
            loadRankings();
            break;
    }
}

/**
 * Data loading functions
 */
async function loadDashboardData() {
    console.log('[loadDashboardData] START - currentActiveSection:', currentActiveSection, 'isRecordingScore:', isRecordingScore);
    
    try {
        const clubResponse = await fetch('/api/club_info');
        const clubData = await clubResponse.json();
        
        if (clubData.success) {
            currentClubData = clubData.club;
            currentPlayerData = clubData.player;
            updateDashboardHeader(clubData);
            
            // NEVER load overview data or change sections
            console.log('[loadDashboardData] Updated header data only');
        } else {
            throw new Error(clubData.error || 'Failed to load club data');
        }
        
    } catch (error) {
        console.error('[loadDashboardData] ERROR:', error);
        showAlert('Failed to load dashboard data: ' + error.message, 'danger');
    }
    
    console.log('[loadDashboardData] END');
}

function updateDashboardHeader(data) {
    console.log('Updating dashboard header with:', data);
    
    // Update header stats
    const clubNameEl = document.getElementById('clubName');
    const totalMembersEl = document.getElementById('totalMembers');
    const totalGamesEl = document.getElementById('totalGames');
    const playerEloEl = document.getElementById('playerElo');
    
    if (clubNameEl) clubNameEl.textContent = data.club.name;
    if (totalMembersEl) totalMembersEl.textContent = data.club.total_members;
    if (totalGamesEl) totalGamesEl.textContent = data.club.games_played;
    if (playerEloEl) playerEloEl.textContent = data.player.elo;
    
    // Update overview stats
    const overviewMembersEl = document.getElementById('overviewMembers');
    const avgEloEl = document.getElementById('avgElo');
    const courtsCountEl = document.getElementById('courtsCount');
    
    if (overviewMembersEl) overviewMembersEl.textContent = data.club.total_members;
    if (avgEloEl) avgEloEl.textContent = Math.round(data.player.elo);
    if (courtsCountEl) courtsCountEl.textContent = data.club.courts;
    
    // Check advanced stats access
    checkAdvancedStatsAccess();
    
    // Initialize demo timer if this is a demo club
    if (data.club.is_demo) {
        initDemoTimer();
    }
}

async function loadOverviewData() {
    try {
        // Load recent games for overview
        const gamesResponse = await fetch('/api/games');
        const gamesData = await gamesResponse.json();
        
        if (gamesData.success) {
            updateRecentGames(gamesData.games.slice(0, 5));
            const overviewGamesEl = document.getElementById('overviewGames');
            if (overviewGamesEl) {
                overviewGamesEl.textContent = gamesData.games.length;
            }
        }
    } catch (error) {
        console.error('Error loading overview data:', error);
    }
}

function updateRecentGames(games) {
    const container = document.getElementById('recentGames');
    
    if (!container) return;
    
    if (games.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 2rem;">No recent games found.</p>';
        return;
    }
    
    container.innerHTML = games.map(game => `
        <div class="recent-game-item">
            <div class="game-teams">
                <strong>${game.team1.join(' & ')}</strong>
                <span class="score">${game.score[0]} - ${game.score[1]}</span>
                <strong>${game.team2.join(' & ')}</strong>
            </div>
            <div class="game-meta">
                <span class="date">${formatDate(game.date)}</span>
                ${game.court ? `<span class="court">Court: ${game.court}</span>` : ''}
            </div>
        </div>
    `).join('');
}

async function loadMembers() {
    try {
        const response = await fetch('/api/members');
        const data = await response.json();
        
        if (data.success) {
            updateMembersTable(data.members);
            updateAddMemberButton(data.can_add_more, data.is_admin);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading members:', error);
        showAlert('Failed to load members: ' + error.message, 'danger');
    }
}

function updateMembersTable(members) {
    const tbody = document.querySelector('#membersTable tbody');
    
    if (!tbody) return;
    
    if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No members found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = members.map(member => `
        <tr>
            <td>
                <strong>${member.name}</strong>
                ${member.role === 'admin' ? '<span class="badge badge-primary" style="margin-left: 0.5rem;">Admin</span>' : ''}
            </td>
            <td>${member.elo}</td>
            <td>${member.games_played}</td>
            <td>${member.win_rate.toFixed(1)}%</td>
            <td>
                <span class="badge ${member.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">
                    ${member.role}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    ${currentPlayerData && currentPlayerData.role === 'admin' ? `
                        <button class="btn btn-sm btn-warning" onclick="toggleMemberRole('${member.name}', '${member.role}')">
                            ${member.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        ${member.name !== currentPlayerData.name ? `
                            <button class="btn btn-sm btn-danger" onclick="removeMember('${member.name}')">
                                Remove
                            </button>
                        ` : ''}
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

function updateAddMemberButton(canAdd, isAdmin) {
    const button = document.getElementById('addMemberBtn');
    if (button) {
        button.style.display = (canAdd && isAdmin) ? 'inline-flex' : 'none';
    }
}

async function loadGames() {
    try {
        const response = await fetch('/api/games');
        const data = await response.json();
        
        if (data.success) {
            updateGamesTable(data.games);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading games:', error);
        showAlert('Failed to load games: ' + error.message, 'danger');
    }
}

function updateGamesTable(games) {
    const tbody = document.querySelector('#gamesTable tbody');
    
    if (!tbody) return;
    
    if (games.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No games found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = games.map(game => `
        <tr>
            <td>${formatDate(game.date)}</td>
            <td>${game.team1.join(' & ')}</td>
            <td>
                <strong style="color: ${game.winner === 1 ? 'var(--success-color)' : 'inherit'}">${game.score[0]}</strong>
                -
                <strong style="color: ${game.winner === 2 ? 'var(--success-color)' : 'inherit'}">${game.score[1]}</strong>
            </td>
            <td>${game.team2.join(' & ')}</td>
            <td>
                <span class="badge badge-success">
                    ${game.winner === 1 ? 'Team 1' : 'Team 2'}
                </span>
            </td>
            <td>
                ${currentPlayerData && currentPlayerData.role === 'admin' ? `
                    <button class="btn btn-sm btn-warning" onclick="editGame(${game.id})">
                        Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteGame(${game.id})">
                        Delete
                    </button>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

async function loadRankings() {
    try {
        const response = await fetch('/api/rankings');
        const data = await response.json();
        
        if (data.success) {
            updateRankingsTable(data.rankings, data.has_elo_system);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading rankings:', error);
        showAlert('Failed to load rankings: ' + error.message, 'danger');
    }
}

function updateRankingsTable(rankings, hasEloSystem) {
    const tbody = document.querySelector('#rankingsTable tbody');
    
    if (!tbody) return;
    
    if (rankings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No rankings found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = rankings.map(player => {
        // Calculate trend (simplified - just show if above/below average)
        const avgWinRate = rankings.reduce((sum, p) => sum + p.win_rate, 0) / rankings.length;
        const trend = player.win_rate >= avgWinRate ? 'up' : 'down';
        
        return `
            <tr style="${player.name === currentPlayerData?.name ? 'background: var(--primary-lighter);' : ''}">
                <td>
                    <span style="font-weight: 700; color: ${player.rank <= 3 ? 'var(--accent-color)' : 'inherit'}">#${player.rank}</span>
                </td>
                <td>
                    <strong>${player.name}</strong>
                    ${player.name === currentPlayerData?.name ? '<span class="badge badge-info" style="margin-left: 0.5rem;">You</span>' : ''}
                </td>
                <td>${hasEloSystem ? player.elo : 'N/A'}</td>
                <td><strong>${player.games_played}</strong></td>
                <td>
                    <span style="color: ${player.win_rate >= 50 ? 'var(--success-color)' : 'inherit'}; font-weight: 600;">
                        ${player.win_rate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <i class="fas fa-arrow-${trend}" style="color: ${trend === 'up' ? 'var(--success-color)' : 'var(--danger-color)'};"></i>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadMembersForForm() {
    try {
        const response = await fetch('/api/members');
        const data = await response.json();
        
        if (data.success) {
            const selects = document.querySelectorAll('#recordGameForm select');
            const options = data.members.map(member => 
                `<option value="${member.name}">${member.name}</option>`
            ).join('');
            
            selects.forEach(select => {
                select.innerHTML = '<option value="">Select player...</option>' + options;
            });
        }
    } catch (error) {
        console.error('Error loading members for form:', error);
    }
}

/**
 * Court Organization Functions
 */
async function loadCourtOrganization() {
    try {
        // Load members for active player selection
        const response = await fetch('/api/members');
        const data = await response.json();
        
        if (data.success) {
            allMembers = data.members;
            updateActivePlayersGrid(data.members);
            updateActivePlayerCount();
        }
        
        // Load current court count
        if (currentClubData) {
            const input = document.getElementById('courtCountInput');
            if (input) input.value = currentClubData.courts;
        }
    } catch (error) {
        console.error('Error loading court organization:', error);
    }
}

function updateActivePlayersGrid(members) {
    const grid = document.getElementById('activePlayersGrid');
    
    if (!grid) return;
    
    if (members.length === 0) {
        grid.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No members found.</p>';
        return;
    }
    
    grid.innerHTML = members.map(member => {
        const id = member.name.replace(/\s+/g, '-').replace(/'/g, '');
        return `
            <div class="player-checkbox" id="player-${id}">
                <input type="checkbox" 
                       id="check-${id}" 
                       value="${member.name}"
                       onchange="toggleActivePlayer('${member.name.replace(/'/g, "\\'")}')">
                <label for="check-${id}">
                    ${member.name}
                    <span class="badge badge-primary">${member.elo}</span>
                </label>
            </div>
        `;
    }).join('');
}

function toggleActivePlayer(playerName) {
    const index = activePlayers.indexOf(playerName);
    const id = playerName.replace(/\s+/g, '-').replace(/'/g, '');
    const checkbox = document.querySelector(`#check-${id}`);
    const container = checkbox ? checkbox.closest('.player-checkbox') : null;
    
    if (index > -1) {
        activePlayers.splice(index, 1);
        if (container) container.classList.remove('active');
    } else {
        activePlayers.push(playerName);
        if (container) container.classList.add('active');
    }
    
    console.log('Active players:', activePlayers);
}

async function updateCourtCount() {
    const courtCount = parseInt(document.getElementById('courtCountInput').value);
    
    if (courtCount < 1 || courtCount > 20) {
        showAlert('Please enter a valid number of courts (1-20)', 'danger');
        return;
    }
    
    try {
        const response = await fetch('/api/update_courts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ court_count: courtCount })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Court count updated successfully!', 'success');
            loadDashboardData();
        } else {
            showAlert(result.error || 'Failed to update court count', 'danger');
        }
    } catch (error) {
        console.error('Error updating court count:', error);
        showAlert('Failed to update court count', 'danger');
    }
}

async function generateMatches() {
    if (activePlayers.length < 4) {
        showAlert('Please select at least 4 active players to generate matches', 'warning');
        return;
    }
    
    if (activePlayers.length % 4 !== 0) {
        showAlert(`You have ${activePlayers.length} players selected. Note: ${activePlayers.length % 4} player(s) will sit out.`, 'info');
    }
    
    // Get member ELO ratings
    const playerData = activePlayers.map(name => {
        const member = allMembers.find(m => m.name === name);
        return {
            name: name,
            elo: member ? member.elo : 1200
        };
    });
    
    // Generate balanced matches
    const matches = generateBalancedMatches(playerData);
    displayCourtAssignments(matches);
}

function generateBalancedMatches(players) {
    const matches = [];
    const courtCount = parseInt(document.getElementById('courtCountInput').value);
    const matchesNeeded = Math.min(Math.floor(players.length / 4), courtCount);
    
    // Sort players by ELO for better balancing
    const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
    
    // Simple balanced matching algorithm
    for (let i = 0; i < matchesNeeded; i++) {
        const matchPlayers = sortedPlayers.splice(0, 4);
        
        if (matchPlayers.length === 4) {
            // Pair high-low for balance
            const team1 = [matchPlayers[0], matchPlayers[3]];
            const team2 = [matchPlayers[1], matchPlayers[2]];
            
            const team1Elo = (team1[0].elo + team1[1].elo) / 2;
            const team2Elo = (team2[0].elo + team2[1].elo) / 2;
            const balance = Math.abs(team1Elo - team2Elo);
            
            matches.push({
                court: i + 1,
                team1: team1,
                team2: team2,
                balance: balance
            });
        }
    }
    
    return matches;
}

function displayCourtAssignments(matches) {
    const container = document.getElementById('courtAssignments');
    
    if (!container) return;
    
    if (matches.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No matches to display</p>';
        return;
    }
    
    container.innerHTML = matches.map((match, index) => `
        <div class="court-assignment">
            <div class="court-header">
                <div class="court-title">
                    <i class="fas fa-volleyball-ball"></i> Court ${match.court}
                </div>
            </div>
            <div class="court-match">
                <div class="court-team">
                    <div class="team-label">Team 1</div>
                    <div class="team-players">
                        ${match.team1[0].name} & ${match.team1[1].name}
                    </div>
                    <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                        Avg ELO: ${Math.round((match.team1[0].elo + match.team1[1].elo) / 2)}
                    </div>
                </div>
                <div class="vs-separator">VS</div>
                <div class="court-team">
                    <div class="team-label">Team 2</div>
                    <div class="team-players">
                        ${match.team2[0].name} & ${match.team2[1].name}
                    </div>
                    <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                        Avg ELO: ${Math.round((match.team2[0].elo + match.team2[1].elo) / 2)}
                    </div>
                </div>
            </div>
            <div class="match-balance">
                <i class="fas fa-balance-scale"></i>
                <span class="match-balance-text">
                    Balance: ${match.balance.toFixed(0)} ELO difference
                    ${match.balance < 50 ? '(Excellent)' : match.balance < 100 ? '(Good)' : '(Fair)'}
                </span>
            </div>
            
            <!-- Score Recording Section -->
            <div class="match-score-input">
                <form class="score-form" data-match-index="${index}" 
                      data-team1-p1="${match.team1[0].name}"
                      data-team1-p2="${match.team1[1].name}"
                      data-team2-p1="${match.team2[0].name}"
                      data-team2-p2="${match.team2[1].name}"
                      data-court="Court ${match.court}">
                    <div class="score-inputs">
                        <div class="score-input-group">
                            <label>Team 1 Score</label>
                            <input type="number" 
                                   class="form-input score-input" 
                                   name="team1-score"
                                   min="0" 
                                   max="30" 
                                   required
                                   placeholder="0">
                        </div>
                        <div class="score-separator">-</div>
                        <div class="score-input-group">
                            <label>Team 2 Score</label>
                            <input type="number" 
                                   class="form-input score-input" 
                                   name="team2-score"
                                   min="0" 
                                   max="30" 
                                   required
                                   placeholder="0">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-success btn-sm">
                        <i class="fas fa-save"></i> Record Score
                    </button>
                </form>
            </div>
        </div>
    `).join('');
    
    // NOW attach event listeners to all forms
    attachScoreFormListeners();
    
    showAlert('Matches generated successfully!', 'success');
}

function attachScoreFormListeners() {
    console.log('[attachScoreFormListeners] Attaching listeners to score forms');
    
    const scoreForms = document.querySelectorAll('.score-form');
    console.log('[attachScoreFormListeners] Found', scoreForms.length, 'forms');
    
    scoreForms.forEach((form, idx) => {
        // Remove any existing listeners
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log('[Form Submit] Form', idx, 'submitted');
            
            const matchIndex = newForm.getAttribute('data-match-index');
            const team1p1 = newForm.getAttribute('data-team1-p1');
            const team1p2 = newForm.getAttribute('data-team1-p2');
            const team2p1 = newForm.getAttribute('data-team2-p1');
            const team2p2 = newForm.getAttribute('data-team2-p2');
            const court = newForm.getAttribute('data-court');
            
            const team1Score = parseInt(newForm.querySelector('input[name="team1-score"]').value);
            const team2Score = parseInt(newForm.querySelector('input[name="team2-score"]').value);
            
            console.log('[Form Submit] Data:', {
                matchIndex, team1p1, team1p2, team2p1, team2p2, court,
                team1Score, team2Score
            });
            
            await recordMatchScore(
                event, matchIndex, team1p1, team1p2, team2p1, team2p2, court,
                team1Score, team2Score
            );
        });
    });
}

/**
 * Form handling
 */
function setupForms() {
    // Record game form
    const recordForm = document.getElementById('recordGameForm');
    if (recordForm) {
        recordForm.addEventListener('submit', handleRecordGame);
    }
    
    // Add member form
    const addMemberForm = document.getElementById('addMemberForm');
    if (addMemberForm) {
        addMemberForm.addEventListener('submit', handleAddMember);
    }
}

async function handleRecordGame(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    // Validation
    const players = [data.team1_player1, data.team1_player2, data.team2_player1, data.team2_player2];
    if (new Set(players).size !== 4) {
        showAlert('All four players must be different', 'danger');
        return;
    }
    
    if (data.team1_score === data.team2_score) {
        showAlert('Scores cannot be equal', 'danger');
        return;
    }
    
    try {
        const response = await fetch('/api/record_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Game recorded successfully!', 'success');
            event.target.reset();
            loadDashboardData();
            loadGames();
        } else {
            showAlert(result.error || 'Failed to record game', 'danger');
        }
    } catch (error) {
        console.error('Error recording game:', error);
        showAlert('Failed to record game: ' + error.message, 'danger');
    }
}

async function handleAddMember(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/add_member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Member added successfully!', 'success');
            hideAddMemberModal();
            loadMembers();
            loadDashboardData();
        } else {
            showAlert(result.error || 'Failed to add member', 'danger');
        }
    } catch (error) {
        console.error('Error adding member:', error);
        showAlert('Failed to add member: ' + error.message, 'danger');
    }
}

/**
 * Modal functions
 */
function showAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    if (modal) modal.style.display = 'flex';
}

function hideAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('addMemberForm');
    if (form) form.reset();
}

/**
 * Member management functions
 */
async function toggleMemberRole(memberName, currentRole) {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const action = newRole === 'admin' ? 'promote' : 'demote';
    
    if (!confirm(`Are you sure you want to ${action} ${memberName}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/${action}_member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_name: memberName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            loadMembers();
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        console.error('Error updating member role:', error);
        showAlert('Failed to update member role', 'danger');
    }
}

async function removeMember(memberName) {
    if (!confirm(`Are you sure you want to remove ${memberName} from the club?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/remove_member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_name: memberName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Member removed successfully!', 'success');
            loadMembers();
            loadDashboardData();
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        console.error('Error removing member:', error);
        showAlert('Failed to remove member', 'danger');
    }
}

/**
 * Game management functions
 */
async function editGame(gameId) {
    const newTeam1Score = prompt('Enter new Team 1 score:');
    const newTeam2Score = prompt('Enter new Team 2 score:');
    
    if (!newTeam1Score || !newTeam2Score) return;
    
    try {
        const response = await fetch('/api/edit_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: gameId,
                team1_score: parseInt(newTeam1Score),
                team2_score: parseInt(newTeam2Score)
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Game updated successfully!', 'success');
            loadGames();
            loadDashboardData();
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        console.error('Error editing game:', error);
        showAlert('Failed to edit game', 'danger');
    }
}

async function deleteGame(gameId) {
    if (!confirm('Are you sure you want to delete this game?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/delete_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Game deleted successfully!', 'success');
            loadGames();
            loadDashboardData();
        } else {
            showAlert(result.error, 'danger');
        }
    } catch (error) {
        console.error('Error deleting game:', error);
        showAlert('Failed to delete game', 'danger');
    }
}

/**
 * Utility functions
 */
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        console.log('Alert:', message);
        return;
    }
    
    const alertId = 'alert-' + Date.now();
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.className = `alert alert-${type} fade-in`;
    alertDiv.innerHTML = `
        <i class="fas fa-${getAlertIcon(type)}"></i>
        ${message}
    `;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        const element = document.getElementById(alertId);
        if (element) element.remove();
    }, 5000);
}

function clearAlerts() {
    const alertContainer = document.getElementById('alertContainer');
    if (alertContainer) {
        alertContainer.innerHTML = '';
    }
}

function getAlertIcon(type) {
    const icons = {
        'success': 'check-circle',
        'danger': 'exclamation-triangle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Export functions for global access
window.showSection = showSection;
window.showAddMemberModal = showAddMemberModal;
window.hideAddMemberModal = hideAddMemberModal;
window.toggleMemberRole = toggleMemberRole;
window.removeMember = removeMember;
window.editGame = editGame;
window.deleteGame = deleteGame;
window.toggleActivePlayer = toggleActivePlayer;
window.updateCourtCount = updateCourtCount;
window.generateMatches = generateMatches;

console.log('Dashboard.js loaded successfully');

let playersWhoPlayedThisSession = [];

async function recordMatchScore(event, matchIndex, team1p1, team1p2, team2p1, team2p2, court, team1Score, team2Score) {
    console.log('[recordMatchScore] START - matchIndex:', matchIndex);
    console.log('[recordMatchScore] Scores:', team1Score, 'vs', team2Score);
    
    // Set the mutex lock
    isRecordingScore = true;
    currentActiveSection = 'courts';
    
    if (isNaN(team1Score) || isNaN(team2Score)) {
        showAlert('Please enter valid scores', 'danger');
        isRecordingScore = false;
        return;
    }
    
    if (team1Score === team2Score) {
        showAlert('Scores cannot be equal', 'danger');
        isRecordingScore = false;
        return;
    }
    
    // Disable the submit button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recording...';
    }
    
    const gameData = {
        team1_player1: team1p1,
        team1_player2: team1p2,
        team2_player1: team2p1,
        team2_player2: team2p2,
        team1_score: team1Score,
        team2_score: team2Score,
        court: court
    };
    
    console.log('[recordMatchScore] Game data:', gameData);
    
    try {
        console.log('[recordMatchScore] Sending API request...');
        const response = await fetch('/api/record_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gameData)
        });
        
        console.log('[recordMatchScore] Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[recordMatchScore] API response:', result);
        
        if (result.success) {
            // After recording the game successfully, replace the increment section:
            const winner = team1Score > team2Score ? 'Team 1' : 'Team 2';
            showAlert(`Match recorded! ${winner} wins ${Math.max(team1Score, team2Score)}-${Math.min(team1Score, team2Score)}`, 'success');

            // Increment game count for all 4 players
            [team1p1, team1p2, team2p1, team2p2].forEach(player => {
                sessionGameCounts[player] = (sessionGameCounts[player] || 0) + 1;
            });

            // Track wins
            const winningPlayers = team1Score > team2Score ? [team1p1, team1p2] : [team2p1, team2p2];
            winningPlayers.forEach(player => {
                sessionWins[player] = (sessionWins[player] || 0) + 1;
            });

            console.log('[recordMatchScore] Session game counts:', sessionGameCounts);
            console.log('[recordMatchScore] Session wins:', sessionWins);
                        
            // Update visual display to show game counts
            updatePlayerGameCounts();
            
            // Clear inputs
            const form = event.target;
            form.querySelector('input[name="team1-score"]').value = '';
            form.querySelector('input[name="team2-score"]').value = '';
            
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Record Score';
            }
            
            // Update stats
            console.log('[recordMatchScore] Calling loadDashboardData...');
            await loadDashboardData();
            await loadOverviewData();
            if (currentRankingView === 'session') {
                loadSessionRankings();
            } else {
                loadRankings();
            }
            console.log('[recordMatchScore] loadDashboardData completed');
            
            // Generate new matches prioritizing players with fewer games
            if (activePlayers.length >= 4) {
                console.log('[recordMatchScore] Generating new matches with fair rotation');
                generateFairMatches();
                showAlert('New matches generated!', 'info');
            } else {
                const container = document.getElementById('courtAssignments');
                if (container) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 2rem; background: var(--bg-secondary); border-radius: 12px; border: 2px dashed var(--border-color);">
                            <i class="fas fa-info-circle" style="font-size: 3rem; color: var(--primary-color); margin-bottom: 1rem;"></i>
                            <p style="color: var(--text-primary); font-weight: 600; margin-bottom: 0.5rem;">
                                Not Enough Players
                            </p>
                            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                                Need at least 4 active players selected. Currently have ${activePlayers.length}.
                            </p>
                        </div>
                    `;
                }
            }
            
        } else {
            throw new Error(result.error || 'Failed to record game');
        }
    } catch (error) {
        console.error('[recordMatchScore] ERROR:', error);
        showAlert('Failed to record match score: ' + error.message, 'danger');
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Record Score';
        }
    } finally {
        console.log('[recordMatchScore] END - Releasing mutex lock');
        isRecordingScore = false;
    }
}

function generateFairMatches() {
    if (activePlayers.length < 4) {
        showAlert('Need at least 4 active players to generate matches', 'warning');
        return;
    }
    
    // Get player data with ELO and game counts
    const playerData = activePlayers.map(name => {
        const member = allMembers.find(m => m.name === name);
        return {
            name: name,
            elo: member ? member.elo : 1200,
            gamesPlayed: sessionGameCounts[name] || 0
        };
    });
    
    // Sort by games played (ascending) then by ELO for balance
    playerData.sort((a, b) => {
        if (a.gamesPlayed !== b.gamesPlayed) {
            return a.gamesPlayed - b.gamesPlayed; // Fewer games first
        }
        return b.elo - a.elo; // Then by ELO descending
    });
    
    console.log('[generateFairMatches] Sorted players:', playerData.map(p => `${p.name} (${p.gamesPlayed} games, ${p.elo} ELO)`));
    
    // Generate matches prioritizing players with fewer games
    const matches = [];
    const courtCount = parseInt(document.getElementById('courtCountInput').value) || 4;
    const matchesNeeded = Math.min(Math.floor(playerData.length / 4), courtCount);
    
    for (let i = 0; i < matchesNeeded; i++) {
        // Take 4 players with fewest games
        const matchPlayers = playerData.splice(0, 4);
        
        if (matchPlayers.length === 4) {
            // Balance teams by ELO while using players with fewest games
            // Pair highest and lowest ELO for each team
            matchPlayers.sort((a, b) => b.elo - a.elo);
            
            const team1 = [matchPlayers[0], matchPlayers[3]];
            const team2 = [matchPlayers[1], matchPlayers[2]];
            
            const team1Elo = (team1[0].elo + team1[1].elo) / 2;
            const team2Elo = (team2[0].elo + team2[1].elo) / 2;
            const balance = Math.abs(team1Elo - team2Elo);
            
            matches.push({
                court: i + 1,
                team1: team1,
                team2: team2,
                balance: balance
            });
        }
    }
    
    displayCourtAssignments(matches);
}

function updatePlayerGameCounts() {
    // Update visual display to show how many games each player has played
    allMembers.forEach(member => {
        const id = member.name.replace(/\s+/g, '-').replace(/'/g, '');
        const container = document.querySelector(`#player-${id}`);
        
        if (container) {
            const gameCount = sessionGameCounts[member.name] || 0;
            let countBadge = container.querySelector('.game-count-badge');
            
            if (!countBadge) {
                countBadge = document.createElement('span');
                countBadge.className = 'game-count-badge';
                const label = container.querySelector('label');
                if (label) label.appendChild(countBadge);
            }
            
            if (gameCount > 0) {
                countBadge.textContent = `${gameCount} ${gameCount === 1 ? 'game' : 'games'}`;
                countBadge.style.cssText = 'font-size: 0.7rem; color: var(--text-secondary); margin-left: 0.5rem; font-weight: 500;';
            } else {
                countBadge.textContent = '';
            }
        }
    });
}

function updatePlayerPlayedStatus() {
    // Add visual indicator to players who have played
    allMembers.forEach(member => {
        const id = member.name.replace(/\s+/g, '-').replace(/'/g, '');
        const container = document.querySelector(`#player-${id}`);
        
        if (container) {
            const hasPlayed = playersWhoPlayedThisSession.includes(member.name);
            const playedBadge = container.querySelector('.played-badge');
            
            if (hasPlayed && !playedBadge) {
                // Add "played" indicator
                const badge = document.createElement('span');
                badge.className = 'played-badge';
                badge.innerHTML = '<i class="fas fa-check"></i> Played';
                badge.style.cssText = 'font-size: 0.7rem; color: var(--success-color); margin-left: 0.5rem; font-weight: 600;';
                
                const label = container.querySelector('label');
                if (label) label.appendChild(badge);
            } else if (!hasPlayed && playedBadge) {
                // Remove "played" indicator if player is reset
                playedBadge.remove();
            }
        }
    });
}

function generateMatchesForPlayers(playerList) {
    if (playerList.length < 4) {
        showAlert('Need at least 4 players to generate matches', 'warning');
        return;
    }
    
    // Get member ELO ratings for available players
    const playerData = playerList.map(name => {
        const member = allMembers.find(m => m.name === name);
        return {
            name: name,
            elo: member ? member.elo : 1200
        };
    });
    
    // Generate balanced matches
    const matches = generateBalancedMatches(playerData);
    displayCourtAssignments(matches);
}

function startNewRound() {
    // Clear the played status for all players
    playersWhoPlayedThisSession = [];
    updatePlayerPlayedStatus();
    
    // Regenerate matches with all active players
    if (activePlayers.length >= 4) {
        generateMatches();
        showAlert('New round started with all active players!', 'success');
    } else {
        showAlert('Need at least 4 active players to start a round', 'warning');
    }
}

function resetActivePlayers() {
    // Clear active players AND session game counts
    activePlayers = [];
    sessionGameCounts = {};
    sessionWins = {}; // Add this line
    
    document.querySelectorAll('.player-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.player-checkbox').classList.remove('active');
    });
    
    updatePlayerGameCounts();
    updateActivePlayerCount();
    
    // Clear court assignments
    const container = document.getElementById('courtAssignments');
    if (container) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">Select active players and generate matches to see court assignments</p>';
    }
    
    showAlert('Session reset. All game counts cleared.', 'info');
}

/**
 * Subscription Management
 */
async function loadSubscriptionData() {
    if (!currentClubData) return;
    
    const planName = document.getElementById('currentPlanName');
    const memberLimit = document.getElementById('memberLimit');
    const maxMembers = document.getElementById('maxMembers');
    const courtLimit = document.getElementById('courtLimit');
    
    if (planName) planName.textContent = currentClubData.subscription?.name || 'Starter';
    if (memberLimit) memberLimit.textContent = currentClubData.total_members;
    if (maxMembers) maxMembers.textContent = currentClubData.subscription?.max_members || '10';
    if (courtLimit) {
        const max = currentClubData.subscription?.max_courts;
        courtLimit.textContent = max === 999 ? 'Unlimited' : max;
    }
    
    // Update button states based on current tier
    updateSubscriptionButtons(currentClubData.subscription?.tier || 'free');

    const manageBtn = document.getElementById('manageSubBtn');
    if (manageBtn && currentClubData.subscription?.tier !== 'free') {
        manageBtn.style.display = 'inline-flex';
    }
}

function updateSubscriptionButtons(currentTier) {
    const freeBtn = document.getElementById('freeBtn');
    const proBtn = document.getElementById('proBtn');
    const eliteBtn = document.getElementById('eliteBtn');
    
    // Reset all buttons
    [freeBtn, proBtn, eliteBtn].forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.className = 'btn btn-primary btn-block';
            btn.textContent = 'Select Plan';
        }
    });
    
    // Mark current plan
    if (currentTier === 'free' && freeBtn) {
        freeBtn.disabled = true;
        freeBtn.className = 'btn btn-secondary btn-block';
        freeBtn.textContent = 'Current Plan';
    } else if (currentTier === 'pro' && proBtn) {
        proBtn.disabled = true;
        proBtn.className = 'btn btn-secondary btn-block';
        proBtn.textContent = 'Current Plan';
    } else if (currentTier === 'elite' && eliteBtn) {
        eliteBtn.disabled = true;
        eliteBtn.className = 'btn btn-secondary btn-block';
        eliteBtn.textContent = 'Current Plan';
    }
}

async function upgradePlan(tier) {
    if (!confirm(`Upgrade to ${tier.toUpperCase()} plan?`)) {
        return;
    }
    
    try {
        showAlert('Redirecting to checkout...', 'info');
        
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier: tier })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Redirect to Stripe Checkout
            window.location.href = result.checkout_url;
        } else {
            showAlert(result.error || 'Failed to start checkout', 'danger');
        }
    } catch (error) {
        console.error('Error creating checkout:', error);
        showAlert('Failed to start checkout process', 'danger');
    }
}

async function manageSubscription() {
    try {
        const response = await fetch('/api/create-portal-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.location.href = result.url;
        } else {
            showAlert(result.error || 'Failed to open subscription portal', 'danger');
        }
    } catch (error) {
        console.error('Error opening portal:', error);
        showAlert('Failed to open subscription management', 'danger');
    }
}

window.manageSubscription = manageSubscription;

// Update loadSectionData to include subscription
function loadSectionData(sectionName) {
    console.log('Loading data for section:', sectionName);
    switch(sectionName) {
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadCourtOrganization();
            break;
        case 'games':
            loadGames();
            loadMembersForForm();
            break;
        case 'rankings':
            loadRankings();
            break;
        case 'subscription':
            loadSubscriptionData();
            break;
    }
}

// Export the function
window.upgradePlan = upgradePlan;

function selectAllPlayers() {
    activePlayers = [];
    
    document.querySelectorAll('.player-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = true;
        const container = checkbox.closest('.player-checkbox');
        if (container) container.classList.add('active');
        activePlayers.push(checkbox.value);
    });
    
    updateActivePlayerCount();
    showAlert(`${activePlayers.length} players selected`, 'success');
}

function deselectAllPlayers() {
    activePlayers = [];
    
    document.querySelectorAll('.player-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
        const container = checkbox.closest('.player-checkbox');
        if (container) container.classList.remove('active');
    });
    
    updateActivePlayerCount();
    
    // Clear court assignments
    const container = document.getElementById('courtAssignments');
    if (container) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">Select active players and generate matches to see court assignments</p>';
    }
    
    showAlert('All players deselected', 'info');
}

function updateActivePlayerCount() {
    const badge = document.getElementById('activePlayerCount');
    if (badge) {
        badge.textContent = `${activePlayers.length} selected`;
        badge.className = activePlayers.length >= 4 ? 'badge badge-success' : 'badge badge-warning';
    }
}

// Update toggleActivePlayer to update count
function toggleActivePlayer(playerName) {
    const index = activePlayers.indexOf(playerName);
    const id = playerName.replace(/\s+/g, '-').replace(/'/g, '');
    const checkbox = document.querySelector(`#check-${id}`);
    const container = checkbox ? checkbox.closest('.player-checkbox') : null;
    
    if (index > -1) {
        activePlayers.splice(index, 1);
        if (container) container.classList.remove('active');
    } else {
        activePlayers.push(playerName);
        if (container) container.classList.add('active');
    }
    
    updateActivePlayerCount();
    console.log('Active players:', activePlayers);
}

// Export new functions
window.selectAllPlayers = selectAllPlayers;
window.deselectAllPlayers = deselectAllPlayers;

let currentRankingView = 'alltime'; // Track which ranking view is active

function switchRankingView(viewType) {
    console.log('[switchRankingView] Switching to:', viewType);
    currentRankingView = viewType;
    
    // Update button states
    document.querySelectorAll('.ranking-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-ranking-type') === viewType) {
            btn.classList.add('active');
        }
    });
    
    // Update table header
    const metricHeader = document.getElementById('rankingMetricHeader');
    if (metricHeader) {
        metricHeader.textContent = viewType === 'session' ? 'Games This Session' : 'ELO Rating';
    }
    
    // Load appropriate rankings
    if (viewType === 'session') {
        loadSessionRankings();
    } else {
        loadRankings();
    }
}

async function loadSessionRankings() {
    const tbody = document.querySelector('#rankingsTable tbody');
    
    if (!tbody) return;
    
    // Filter to only active players who have played games
    const sessionPlayers = activePlayers
        .filter(name => (sessionGameCounts[name] || 0) > 0)
        .map(name => {
            const member = allMembers.find(m => m.name === name);
            const gamesPlayed = sessionGameCounts[name] || 0;
            const wins = sessionWins[name] || 0;
            const sessionWinRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
            
            return {
                name: name,
                gamesPlayed: gamesPlayed,
                wins: wins,
                losses: gamesPlayed - wins,
                sessionWinRate: sessionWinRate,
                elo: member ? member.elo : 1200,
                totalGames: member ? member.games_played : 0,
                overallWinRate: member ? member.win_rate : 0
            };
        })
        .sort((a, b) => {
            // Sort by session wins, then by session games played
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.gamesPlayed - a.gamesPlayed;
        });
    
    if (sessionPlayers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 2rem;">
                    <i class="fas fa-info-circle" style="color: var(--text-secondary); margin-right: 0.5rem;"></i>
                    No games played this session yet. Record some matches to see session rankings!
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = sessionPlayers.map((player, index) => {
        const trend = player.sessionWinRate >= 50 ? 'up' : 'down';
        
        return `
            <tr style="${player.name === currentPlayerData?.name ? 'background: var(--primary-lighter);' : ''}">
                <td>
                    <span style="font-weight: 700; color: ${index < 3 ? 'var(--accent-color)' : 'inherit'}">#${index + 1}</span>
                </td>
                <td>
                    <strong>${player.name}</strong>
                    ${player.name === currentPlayerData?.name ? '<span class="badge badge-info" style="margin-left: 0.5rem;">You</span>' : ''}
                </td>
                <td>
                    <strong style="color: var(--primary-color);">${player.wins}</strong>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);"> / ${player.gamesPlayed}</span>
                </td>
                <td><strong>${player.gamesPlayed}</strong></td>
                <td>
                    <span style="color: ${player.sessionWinRate >= 50 ? 'var(--success-color)' : 'inherit'}; font-weight: 600;">
                        ${player.sessionWinRate.toFixed(1)}%
                    </span>
                </td>
                <td>
                    <i class="fas fa-arrow-${trend}" style="color: ${trend === 'up' ? 'var(--success-color)' : 'var(--danger-color)'};"></i>
                </td>
            </tr>
        `;
    }).join('');
}

// Update loadSectionData to handle rankings properly
function loadSectionData(sectionName) {
    console.log('Loading data for section:', sectionName);
    switch(sectionName) {
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadCourtOrganization();
            break;
        case 'games':
            loadGames();
            loadMembersForForm();
            break;
        case 'rankings':
            // Load based on current view
            if (currentRankingView === 'session') {
                loadSessionRankings();
            } else {
                loadRankings();
            }
            break;
        case 'subscription':
            loadSubscriptionData();
            break;
    }
}

// Export the function
window.switchRankingView = switchRankingView;

let demoTimerInterval = null;
let lastDemoTimeCheck = null;

function initDemoTimer() {
    if (!currentClubData || !currentClubData.is_demo) {
        return;
    }
    
    console.log('[initDemoTimer] Initializing demo timer');
    
    // Show demo timer bar
    const timerBar = document.getElementById('demoTimerBar');
    if (timerBar) {
        timerBar.style.display = 'block';
    }
    
    // Start polling for demo time
    updateDemoTimer();
    
    // Check every 5 seconds
    if (demoTimerInterval) {
        clearInterval(demoTimerInterval);
    }
    
    demoTimerInterval = setInterval(updateDemoTimer, 1000);
}

async function updateDemoTimer() {
    try {
        const response = await fetch('/api/club_info');
        const data = await response.json();
        
        if (data.success && data.club.is_demo) {
            const timeLeft = data.club.demo_time_left || 0;
            lastDemoTimeCheck = timeLeft;
            
            // Update display
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const timeDisplay = document.getElementById('demoTimeRemaining');
            if (timeDisplay) {
                timeDisplay.textContent = timeString;
            }
            
            // Change color when under 2 minutes
            const timerBar = document.getElementById('demoTimerBar');
            if (timerBar) {
                if (timeLeft < 120) {
                    timerBar.classList.add('warning');
                } else {
                    timerBar.classList.remove('warning');
                }
            }
            
            // Show warning at 2 minutes
            if (timeLeft === 120) {
                showAlert('Demo session expires in 2 minutes! All changes will be reset.', 'warning');
            }
            
            // Show final warning at 30 seconds
            if (timeLeft === 30) {
                showAlert('Demo session expires in 30 seconds!', 'danger');
            }
            
            // Time expired - reload page to reset demo
            if (timeLeft <= 0) {
                showAlert('Demo session expired. Resetting demo data...', 'info');
                
                // Clear interval
                if (demoTimerInterval) {
                    clearInterval(demoTimerInterval);
                }
                
                // Wait 2 seconds then reload
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 2000);
            }
        }
    } catch (error) {
        console.error('[updateDemoTimer] Error:', error);
    }
}

function stopDemoTimer() {
    if (demoTimerInterval) {
        clearInterval(demoTimerInterval);
        demoTimerInterval = null;
    }
}

async function downloadAdvancedStats() {
    try {
        showAlert('Generating advanced statistics PDF...', 'info');
        
        const response = await fetch('/api/advanced_stats');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to generate stats');
        }
        
        // Generate PDF
        generateStatsPDF(data);
        
        showAlert('Stats PDF downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error downloading stats:', error);
        showAlert(error.message || 'Failed to download stats. This feature requires Pro or Elite subscription.', 'danger');
    }
}

function generateStatsPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let yPosition = 20;
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(30, 64, 175); // Primary color
    doc.text(`${data.club_name}`, pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 8;
    doc.setFontSize(14);
    doc.setTextColor(107, 114, 128); // Secondary text color
    doc.text('Advanced Player Statistics', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 6;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 10;
    
    // Club summary box
    doc.setFillColor(248, 250, 252); // Light background
    doc.rect(15, yPosition, pageWidth - 30, 15, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(`Total Members: ${data.total_members}`, 20, yPosition + 6);
    doc.text(`Total Games: ${data.total_games}`, pageWidth / 2, yPosition + 6);
    doc.text(`Report Date: ${new Date().toLocaleDateString()}`, pageWidth - 60, yPosition + 6);
    
    yPosition += 20;
    
    // Overall Statistics Table
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text('Overall Player Statistics', 15, yPosition);
    yPosition += 5;
    
    const overallStats = [];
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        overallStats.push([
            playerName,
            stats.total_games.toString(),
            stats.total_wins.toString(),
            stats.total_losses.toString(),
            `${stats.win_rate.toFixed(1)}%`,
            stats.elo.toString(),
            stats.scores.avg_points_scored.toFixed(1),
            stats.scores.avg_points_conceded.toFixed(1)
        ]);
    }
    
    doc.autoTable({
        startY: yPosition,
        head: [['Player', 'Games', 'Wins', 'Losses', 'Win Rate', 'ELO', 'Avg Score', 'Avg Conceded']],
        body: overallStats,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    yPosition = doc.lastAutoTable.finalY + 15;
    
    // Check if we need a new page
    if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
    }
    
    // Partner Statistics
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text('Partner Performance Analysis', 15, yPosition);
    yPosition += 5;
    
    const partnerStats = [];
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        const sortedPartners = Object.entries(stats.partner_stats)
            .sort((a, b) => b[1].games - a[1].games)
            .slice(0, 5); // Top 5 partners per player
        
        for (const [partnerName, partnerData] of sortedPartners) {
            partnerStats.push([
                playerName,
                partnerName,
                partnerData.games.toString(),
                partnerData.wins.toString(),
                partnerData.losses.toString(),
                `${partnerData.win_rate.toFixed(1)}%`
            ]);
        }
    }
    
    if (partnerStats.length > 0) {
        doc.autoTable({
            startY: yPosition,
            head: [['Player', 'Partner', 'Games', 'Wins', 'Losses', 'Win Rate']],
            body: partnerStats,
            theme: 'grid',
            headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });
        
        yPosition = doc.lastAutoTable.finalY + 15;
    }
    
    // Check if we need a new page
    if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
    }
    
    // Score Analysis
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text('Score Analysis', 15, yPosition);
    yPosition += 5;
    
    const scoreStats = [];
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        if (stats.total_games > 0) {
            scoreStats.push([
                playerName,
                stats.scores.highest_score.toString(),
                stats.scores.lowest_score === 100 ? 'N/A' : stats.scores.lowest_score.toString(),
                stats.scores.avg_points_scored.toFixed(1),
                stats.scores.avg_points_conceded.toFixed(1),
                (stats.scores.avg_points_scored - stats.scores.avg_points_conceded).toFixed(1)
            ]);
        }
    }
    
    if (scoreStats.length > 0) {
        doc.autoTable({
            startY: yPosition,
            head: [['Player', 'Best Score', 'Worst Score', 'Avg Score', 'Avg Conceded', 'Point Diff']],
            body: scoreStats,
            theme: 'grid',
            headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });
    }
    
    // Footer on each page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(
            `${data.club_name} - Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }
    
    // Save the PDF
    doc.save(`${data.club_name}_Statistics_${new Date().toISOString().split('T')[0]}.pdf`);
}

function generateStatsCSV(data) {
    let csv = `${data.club_name} - Advanced Player Statistics\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n`;
    csv += `Total Members: ${data.total_members}\n`;
    csv += `Total Games: ${data.total_games}\n\n`;
    
    // Overall Stats
    csv += `Player,Total Games,Wins,Losses,Win Rate,ELO,Avg Score,Avg Conceded,Highest Score,Lowest Score\n`;
    
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        csv += `${playerName},${stats.total_games},${stats.total_wins},${stats.total_losses},${stats.win_rate.toFixed(1)}%,${stats.elo},`;
        csv += `${stats.scores.avg_points_scored},${stats.scores.avg_points_conceded},${stats.scores.highest_score},${stats.scores.lowest_score}\n`;
    }
    
    csv += `\n\nPartner Statistics\n`;
    csv += `Player,Partner,Games Together,Wins,Losses,Win Rate\n`;
    
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        for (const [partnerName, partnerStats] of Object.entries(stats.partner_stats)) {
            csv += `${playerName},${partnerName},${partnerStats.games},${partnerStats.wins},${partnerStats.losses},${partnerStats.win_rate}%\n`;
        }
    }
    
    csv += `\n\nOpponent Statistics\n`;
    csv += `Player,Opponent,Games Against,Wins,Losses,Win Rate\n`;
    
    for (const [playerName, stats] of Object.entries(data.member_stats)) {
        for (const [opponentName, opponentStats] of Object.entries(stats.opponent_stats)) {
            csv += `${playerName},${opponentName},${opponentStats.games},${opponentStats.wins},${opponentStats.losses},${opponentStats.win_rate}%\n`;
        }
    }
    
    return csv;
}

// Show download button for premium users
function checkAdvancedStatsAccess() {
    console.log('[checkAdvancedStatsAccess] Checking access...');
    
    if (!currentClubData || !currentClubData.subscription) {
        console.log('[checkAdvancedStatsAccess] No club data or subscription info');
        return;
    }
    
    const features = currentClubData.subscription.features || [];
    const hasAdvancedAnalytics = features.includes('advanced_analytics');
    
    console.log('[checkAdvancedStatsAccess] Features:', features);
    console.log('[checkAdvancedStatsAccess] Has advanced analytics:', hasAdvancedAnalytics);
    
    const downloadBtn = document.getElementById('downloadStatsBtn');
    if (downloadBtn) {
        downloadBtn.style.display = hasAdvancedAnalytics ? 'inline-flex' : 'none';
        console.log('[checkAdvancedStatsAccess] Button display set to:', hasAdvancedAnalytics ? 'visible' : 'hidden');
    } else {
        console.log('[checkAdvancedStatsAccess] Download button not found in DOM');
    }
}

// Call this when loading rankings or subscription data
function loadSectionData(sectionName) {
    console.log('Loading data for section:', sectionName);
    switch(sectionName) {
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadCourtOrganization();
            break;
        case 'games':
            loadGames();
            loadMembersForForm();
            break;
        case 'rankings':
            checkAdvancedStatsAccess(); // Check if user can download stats
            if (currentRankingView === 'session') {
                loadSessionRankings();
            } else {
                loadRankings();
            }
            break;
        case 'subscription':
            loadSubscriptionData();
            break;
    }
}

// Export function
window.downloadAdvancedStats = downloadAdvancedStats;

let currentTournamentId = null;
let currentTournament = null;

/**
 * Tournament Management
 */
async function loadTournaments() {
    try {
        const response = await fetch('/api/tournaments');
        const data = await response.json();
        
        if (data.success) {
            displayTournaments(data.tournaments);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading tournaments:', error);
        const container = document.getElementById('tournamentsContainer');
        if (container) {
            container.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">Failed to load tournaments. This feature requires Elite subscription.</p>';
        }
    }
}

function displayTournaments(tournaments) {
    const container = document.getElementById('tournamentsContainer');
    
    if (!container) return;
    
    if (tournaments.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <i class="fas fa-trophy" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-secondary);">No tournaments yet. Create your first tournament!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = tournaments.map(tournament => `
        <div class="tournament-card" onclick="viewTournament(${tournament.id})">
            <div class="tournament-header">
                <h4>${tournament.name}</h4>
                <span class="badge badge-${tournament.status === 'completed' ? 'success' : tournament.status === 'knockout' ? 'warning' : 'primary'}">
                    ${tournament.status.replace('_', ' ').toUpperCase()}
                </span>
            </div>
            <div class="tournament-info">
                <div class="tournament-stat">
                    <i class="fas fa-users"></i>
                    <span>${tournament.num_teams} Teams</span>
                </div>
                <div class="tournament-stat">
                    <i class="fas fa-layer-group"></i>
                    <span>${tournament.num_groups} Groups</span>
                </div>
                <div class="tournament-stat">
                    <i class="fas fa-sitemap"></i>
                    <span>${tournament.knockout_rounds} KO Rounds</span>
                </div>
                <div class="tournament-stat">
                    <i class="fas fa-calendar"></i>
                    <span>${tournament.created_at}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function viewTournament(tournamentId) {
    try {
        const response = await fetch(`/api/tournament/${tournamentId}`);
        const data = await response.json();
        
        if (data.success) {
            currentTournamentId = tournamentId;
            currentTournament = data.tournament;
            
            // Hide list, show view
            document.getElementById('tournamentList').style.display = 'none';
            document.getElementById('tournamentView').style.display = 'block';
            document.getElementById('createTournamentBtn').style.display = 'none';
            
            // Update header
            document.getElementById('tournamentViewName').textContent = currentTournament.name;
            document.getElementById('tournamentViewStatus').textContent = currentTournament.status.replace('_', ' ').toUpperCase();
            
            // Display appropriate stage
            if (currentTournament.current_stage === 'groups') {
                displayGroupStage();
            } else {
                displayKnockoutStage();
            }
        }
    } catch (error) {
        console.error('Error loading tournament:', error);
        showAlert('Failed to load tournament', 'danger');
    }
}

function backToTournamentList() {
    document.getElementById('tournamentList').style.display = 'block';
    document.getElementById('tournamentView').style.display = 'none';
    document.getElementById('createTournamentBtn').style.display = 'inline-flex';
    currentTournamentId = null;
    currentTournament = null;
}

function showCreateTournamentModal() {
    const modal = document.getElementById('createTournamentModal');
    if (modal) {
        modal.style.display = 'flex';
        loadTeamSelection();
    }
}

function hideCreateTournamentModal() {
    const modal = document.getElementById('createTournamentModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('createTournamentForm').reset();
        document.getElementById('teamSelectionContainer').innerHTML = '';
    }
}

function loadTeamSelection() {
    const container = document.getElementById('teamSelectionContainer');
    if (!container || !allMembers) return;
    
    // Start with 4 team rows
    for (let i = 0; i < 4; i++) {
        addTeamRow();
    }
}

function addTeamRow() {
    const container = document.getElementById('teamSelectionContainer');
    if (!container) return;
    
    const rowIndex = container.children.length;
    
    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
        <div class="team-row-content">
            <span class="team-number">Team ${rowIndex + 1}</span>
            <select class="form-select" name="player1_${rowIndex}" required>
                <option value="">Select Player 1</option>
                ${allMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
            </select>
            <span style="padding: 0 0.5rem; color: var(--text-secondary);">&</span>
            <select class="form-select" name="player2_${rowIndex}" required>
                <option value="">Select Player 2</option>
                ${allMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeTeamRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    container.appendChild(row);
}

function removeTeamRow(button) {
    button.closest('.team-row').remove();
    
    // Renumber teams
    const container = document.getElementById('teamSelectionContainer');
    const rows = container.querySelectorAll('.team-row');
    rows.forEach((row, index) => {
        const teamNumber = row.querySelector('.team-number');
        if (teamNumber) {
            teamNumber.textContent = `Team ${index + 1}`;
        }
    });
}

// Setup create tournament form
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('createTournamentForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(form);
            const name = formData.get('name');
            const numGroups = formData.get('num_groups');
            const knockoutRounds = formData.get('knockout_rounds');
            
            // Collect teams
            const teams = [];
            const container = document.getElementById('teamSelectionContainer');
            const rows = container.querySelectorAll('.team-row');
            
            rows.forEach((row, index) => {
                const player1 = formData.get(`player1_${index}`);
                const player2 = formData.get(`player2_${index}`);
                
                if (player1 && player2 && player1 !== player2) {
                    teams.push({ player1, player2 });
                }
            });
            
            if (teams.length < 4) {
                showAlert('Need at least 4 teams to create a tournament', 'warning');
                return;
            }
            
            try {
                const response = await fetch('/api/tournament/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        num_groups: numGroups,
                        knockout_rounds: knockoutRounds,
                        teams
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Tournament created successfully!', 'success');
                    hideCreateTournamentModal();
                    loadTournaments();
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Error creating tournament:', error);
                showAlert('Failed to create tournament: ' + error.message, 'danger');
            }
        });
    }
});

function displayGroupStage() {
    const container = document.getElementById('groupsContainer');
    const groupStageView = document.getElementById('groupStageView');
    const knockoutStageView = document.getElementById('knockoutStageView');
    
    groupStageView.style.display = 'block';
    knockoutStageView.style.display = 'none';
    
    if (!container || !currentTournament) return;
    
    const groups = currentTournament.groups;
    const teams = currentTournament.teams;
    const results = currentTournament.group_results;
    
    let html = '<div class="groups-grid">';
    
    for (const [groupName, teamIds] of Object.entries(groups)) {
        html += `
            <div class="group-card">
                <div class="group-header">
                    <h4>${groupName}</h4>
                </div>
                <div class="group-standings">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th>Team</th>
                                <th>P</th>
                                <th>W</th>
                                <th>L</th>
                                <th>Pts</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // Sort teams by points
        const sortedTeams = teamIds.map(teamId => {
            const team = teams.find(t => t.id === teamId);
            const stats = results[teamId] || { played: 0, won: 0, lost: 0, points: 0 };
            return { team, stats };
        }).sort((a, b) => b.stats.points - a.stats.points);
        
        sortedTeams.forEach(({ team, stats }) => {
            html += `
                <tr>
                    <td><strong>${team.name}</strong></td>
                    <td>${stats.played || 0}</td>
                    <td>${stats.won || 0}</td>
                    <td>${stats.lost || 0}</td>
                    <td><strong>${stats.points || 0}</strong></td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                <div class="group-matches">
                    <h5>Record Match</h5>
        `;
        
        // Generate all possible matches in this group
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const team1 = teams.find(t => t.id === teamIds[i]);
                const team2 = teams.find(t => t.id === teamIds[j]);
                
                html += `
                    <div class="match-record-container">
                        <div class="match-header">
                            <strong>${team1.name}</strong> vs <strong>${team2.name}</strong>
                        </div>
                        <form class="sets-form" data-team1-id="${team1.id}" data-team2-id="${team2.id}" data-stage="group">
                            <div class="sets-container" id="sets-group-${team1.id}-${team2.id}">
                                <div class="set-input">
                                    <label>Set 1</label>
                                    <input type="number" name="set1_team1" min="0" max="30" placeholder="0" required>
                                    <span>-</span>
                                    <input type="number" name="set1_team2" min="0" max="30" placeholder="0" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-xs btn-secondary" onclick="addSet('sets-group-${team1.id}-${team2.id}')">
                                    <i class="fas fa-plus"></i> Add Set
                                </button>
                                <button type="submit" class="btn btn-xs btn-success">
                                    <i class="fas fa-save"></i> Record Match
                                </button>
                            </div>
                        </form>
                    </div>
                `;
            }
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Attach form listeners
    attachTournamentMatchListeners();
    
    // Check if all group matches are complete
    const allMatchesPlayed = checkGroupStageComplete();
    const advanceBtn = document.getElementById('advanceToKnockoutBtn');
    if (advanceBtn) {
        advanceBtn.style.display = allMatchesPlayed ? 'block' : 'none';
    }
}

function addSet(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const setCount = container.children.length;
    
    if (setCount >= 3) {
        showAlert('Maximum 3 sets allowed', 'warning');
        return;
    }
    
    const setInput = document.createElement('div');
    setInput.className = 'set-input';
    setInput.innerHTML = `
        <label>Set ${setCount + 1}</label>
        <input type="number" name="set${setCount + 1}_team1" min="0" max="30" placeholder="0" required>
        <span>-</span>
        <input type="number" name="set${setCount + 1}_team2" min="0" max="30" placeholder="0" required>
        <button type="button" class="btn btn-xs btn-danger" onclick="removeSet(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(setInput);
}

function removeSet(button) {
    const setInput = button.closest('.set-input');
    const container = setInput.parentElement;
    
    if (container.children.length <= 1) {
        showAlert('Must have at least 1 set', 'warning');
        return;
    }
    
    setInput.remove();
    
    // Renumber sets
    const sets = container.querySelectorAll('.set-input');
    sets.forEach((set, index) => {
        const label = set.querySelector('label');
        if (label) label.textContent = `Set ${index + 1}`;
        
        const inputs = set.querySelectorAll('input');
        if (inputs[0]) inputs[0].name = `set${index + 1}_team1`;
        if (inputs[1]) inputs[1].name = `set${index + 1}_team2`;
    });
}

function attachTournamentMatchListeners() {
    const forms = document.querySelectorAll('.sets-form');
    
    forms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const team1Id = parseInt(form.getAttribute('data-team1-id'));
            const team2Id = parseInt(form.getAttribute('data-team2-id'));
            const stage = form.getAttribute('data-stage');
            const matchId = form.getAttribute('data-match-id');
            
            // Collect sets
            const sets = [];
            const formData = new FormData(form);
            let setNum = 1;
            
            while (formData.has(`set${setNum}_team1`)) {
                const team1Score = parseInt(formData.get(`set${setNum}_team1`));
                const team2Score = parseInt(formData.get(`set${setNum}_team2`));
                
                if (team1Score === team2Score) {
                    showAlert(`Set ${setNum} cannot be a tie`, 'danger');
                    return;
                }
                
                sets.push({
                    team1_score: team1Score,
                    team2_score: team2Score
                });
                
                setNum++;
            }
            
            if (sets.length === 0) {
                showAlert('Must have at least one set', 'danger');
                return;
            }
            
            // Check match winner
            const team1SetsWon = sets.filter(s => s.team1_score > s.team2_score).length;
            const team2SetsWon = sets.filter(s => s.team2_score > s.team1_score).length;
            
            if (team1SetsWon === team2SetsWon) {
                showAlert('Match must have a winner', 'danger');
                return;
            }
            
            // Record match
            try {
                const response = await fetch(`/api/tournament/${currentTournamentId}/record_match`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        team1_id: team1Id,
                        team2_id: team2Id,
                        sets: sets,
                        stage: stage,
                        match_id: matchId ? parseInt(matchId) : undefined
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Match recorded!', 'success');
                    viewTournament(currentTournamentId);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Error recording match:', error);
                showAlert('Failed to record match: ' + error.message, 'danger');
            }
        });
    });
}

function checkGroupStageComplete() {
    if (!currentTournament) return false;
    
    const groups = currentTournament.groups;
    const results = currentTournament.group_results;
    
    // Check if all teams have played all their matches
    for (const teamIds of Object.values(groups)) {
        const matchesPerTeam = teamIds.length - 1; // Each team plays all others once
        
        for (const teamId of teamIds) {
            const stats = results[teamId];
            if (!stats || stats.played < matchesPerTeam) {
                return false;
            }
        }
    }
    
    return true;
}

async function recordGroupMatch(event, team1Id, team2Id) {
    event.preventDefault();
    
    const form = event.target;
    const score1 = parseInt(form.score1.value);
    const score2 = parseInt(form.score2.value);
    
    if (score1 === score2) {
        showAlert('Scores cannot be equal', 'danger');
        return;
    }
    
    try {
        const response = await fetch(`/api/tournament/${currentTournamentId}/record_match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team1_id: team1Id,
                team2_id: team2Id,
                team1_score: score1,
                team2_score: score2,
                stage: 'group'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Match recorded!', 'success');
            form.reset();
            
            // Reload tournament to update standings
            viewTournament(currentTournamentId);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error recording match:', error);
        showAlert('Failed to record match', 'danger');
    }
}

async function advanceToKnockout() {
    if (!confirm('Are you sure you want to advance to knockout stage? Group stage results will be finalized.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/tournament/${currentTournamentId}/advance_stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Advanced to knockout stage!', 'success');
            viewTournament(currentTournamentId);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error advancing stage:', error);
        showAlert('Failed to advance stage', 'danger');
    }
}

function displayKnockoutStage() {
    const container = document.getElementById('knockoutBracketContainer');
    const groupStageView = document.getElementById('groupStageView');
    const knockoutStageView = document.getElementById('knockoutStageView');
    
    groupStageView.style.display = 'none';
    knockoutStageView.style.display = 'block';
    
    if (!container || !currentTournament) return;
    
    const bracket = currentTournament.knockout_bracket;
    const teams = currentTournament.teams;
    
    if (!bracket.rounds || bracket.rounds.length === 0) {
        container.innerHTML = '<p>Knockout bracket not yet generated</p>';
        return;
    }
    
    let html = '<div class="knockout-bracket">';
    
    const roundNames = ['Quarter Finals', 'Semi Finals', 'Final', 'Winner'];
    
    bracket.rounds.forEach((round, roundIndex) => {
        const roundName = roundNames[roundIndex] || `Round ${roundIndex + 1}`;
        
        html += `
            <div class="knockout-round">
                <h4 class="round-title">${roundName}</h4>
                <div class="knockout-matches">
        `;
        
        round.forEach(match => {
            const team1 = teams.find(t => t.id === match.team1_id);
            const team2 = teams.find(t => t.id === match.team2_id);
            
            if (!team1 || !team2) {
                html += `
                    <div class="knockout-match pending">
                        <div class="match-pending-text">Waiting for previous matches...</div>
                    </div>
                `;
                return;
            }
            
            const isComplete = match.winner_id !== null;
            const sets = match.sets || [];
            
            // Calculate sets won
            const team1SetsWon = sets.filter(s => s.team1_score > s.team2_score).length;
            const team2SetsWon = sets.filter(s => s.team2_score > s.team1_score).length;
            
            html += `
                <div class="knockout-match ${isComplete ? 'completed' : ''}">
                    <div class="match-team ${match.winner_id === match.team1_id ? 'winner' : ''}">
                        <span>${team1.name}</span>
                        <span class="match-score">${isComplete ? team1SetsWon : '-'}</span>
                    </div>
                    <div class="match-team ${match.winner_id === match.team2_id ? 'winner' : ''}">
                        <span>${team2.name}</span>
                        <span class="match-score">${isComplete ? team2SetsWon : '-'}</span>
                    </div>
            `;
            
            if (isComplete && sets.length > 0) {
                html += '<div class="set-scores">';
                sets.forEach((set, idx) => {
                    html += `<span class="set-score">Set ${idx + 1}: ${set.team1_score}-${set.team2_score}</span>`;
                });
                html += '</div>';
            }
            
            if (!isComplete) {
                html += `
                    <form class="sets-form knockout-match-form" data-team1-id="${match.team1_id}" data-team2-id="${match.team2_id}" data-stage="knockout" data-match-id="${match.match_id}">
                        <div class="sets-container" id="sets-ko-${match.match_id}">
                            <div class="set-input">
                                <label>Set 1</label>
                                <input type="number" name="set1_team1" min="0" max="30" placeholder="0" required>
                                <span>-</span>
                                <input type="number" name="set1_team2" min="0" max="30" placeholder="0" required>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-xs btn-secondary" onclick="addSet('sets-ko-${match.match_id}')">
                                <i class="fas fa-plus"></i> Set
                            </button>
                            <button type="submit" class="btn btn-xs btn-success">Record</button>
                        </div>
                    </form>
                `;
            }
            
            html += '</div>';
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Attach form listeners
    attachTournamentMatchListeners();
}

async function recordKnockoutMatch(event, matchId, team1Id, team2Id) {
    event.preventDefault();
    
    const form = event.target;
    const score1 = parseInt(form.score1.value);
    const score2 = parseInt(form.score2.value);
    
    if (score1 === score2) {
        showAlert('Scores cannot be equal in knockout stage', 'danger');
        return;
    }
    
    try {
        const response = await fetch(`/api/tournament/${currentTournamentId}/record_match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team1_id: team1Id,
                team2_id: team2Id,
                team1_score: score1,
                team2_score: score2,
                stage: 'knockout',
                match_id: matchId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Match recorded!', 'success');
            viewTournament(currentTournamentId);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error recording match:', error);
        showAlert('Failed to record match', 'danger');
    }
}

// Update loadSectionData to include tournament
function loadSectionData(sectionName) {
    console.log('Loading data for section:', sectionName);
    switch(sectionName) {
        case 'members':
            loadMembers();
            break;
        case 'courts':
            loadCourtOrganization();
            break;
        case 'games':
            loadGames();
            loadMembersForForm();
            break;
        case 'rankings':
            checkAdvancedStatsAccess();
            if (currentRankingView === 'session') {
                loadSessionRankings();
            } else {
                loadRankings();
            }
            break;
        case 'subscription':
            loadSubscriptionData();
            break;
        case 'tournament':
            checkTournamentAccess();
            loadTournaments();
            break;
    }
}

function checkTournamentAccess() {
    if (!currentClubData || !currentClubData.subscription) {
        return;
    }
    
    const features = currentClubData.subscription.features || [];
    const hasTournamentMode = features.includes('tournament_mode');
    
    const createBtn = document.getElementById('createTournamentBtn');
    if (createBtn && !hasTournamentMode) {
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-lock"></i> Requires Elite';
    }
}

// Export functions
window.showCreateTournamentModal = showCreateTournamentModal;
window.hideCreateTournamentModal = hideCreateTournamentModal;
window.addTeamRow = addTeamRow;
window.removeTeamRow = removeTeamRow;
window.viewTournament = viewTournament;
window.backToTournamentList = backToTournamentList;
window.recordGroupMatch = recordGroupMatch;
window.advanceToKnockout = advanceToKnockout;
window.recordKnockoutMatch = recordKnockoutMatch;
