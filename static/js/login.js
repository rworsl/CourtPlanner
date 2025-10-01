/**
 * Login Page JavaScript - Fixed with debugging
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing login page...');
    initializeLoginPage();
});

function initializeLoginPage() {
    // Set up tab switching
    setupTabSwitching();
    
    // Set up form handlers
    setupLoginForm();
    setupCreateClubForm();
    
    console.log('Login page initialized');
}

/**
 * Tab switching functionality
 */
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.login-tab');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            showTab(targetTab);
        });
    });
}

function showTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.login-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    // Show/hide forms with smooth transition
    const loginForm = document.getElementById('loginForm');
    const createForm = document.getElementById('createForm');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        createForm.style.display = 'none';
        setTimeout(() => loginForm.classList.add('fade-in'), 10);
    } else if (tab === 'create') {
        createForm.style.display = 'block';
        loginForm.style.display = 'none';
        setTimeout(() => createForm.classList.add('fade-in'), 10);
    }
    
    clearAlerts();
}

/**
 * Login form setup and handling - FIXED
 */
function setupLoginForm() {
    const loginForm = document.getElementById('loginFormElement');
    
    if (!loginForm) {
        console.error('Login form not found!');
        return;
    }
    
    console.log('Setting up login form event listener...');
    
    loginForm.addEventListener('submit', function(event) {
        console.log('Login form submitted');
        handleLogin(event);
    });
}

function handleLogin(event) {
    event.preventDefault();
    console.log('handleLogin called');
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Get the data and log it
    const data = {
        club_code: formData.get('club_code'),
        player_name: formData.get('player_name')
    };
    
    console.log('Login data:', data);
    
    // Validate inputs
    if (!data.club_code || !data.club_code.trim()) {
        showAlert('Please enter a club code');
        return;
    }
    
    if (!data.player_name || !data.player_name.trim()) {
        showAlert('Please enter your name');
        return;
    }
    
    // Clean the data
    data.club_code = data.club_code.trim();
    data.player_name = data.player_name.trim();
    
    console.log('Cleaned login data:', data);
    
    setButtonLoading('loginBtn', true);
    clearAlerts();
    
    console.log('Sending login request...');
    
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        console.log('Login response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        console.log('Login result:', result);
        if (result.success) {
            showAlert('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                console.log('Redirecting to dashboard...');
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            showAlert(result.error || 'Login failed. Please check your credentials.');
            setButtonLoading('loginBtn', false);
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        showAlert('Connection error. Please check your internet connection and try again.');
        setButtonLoading('loginBtn', false);
    });
}

/**
 * Create club form setup and handling
 */
function setupCreateClubForm() {
    const createForm = document.getElementById('createFormElement');
    
    if (!createForm) {
        console.error('Create club form not found');
        return;
    }
    
    createForm.addEventListener('submit', handleCreateClub);
}

function handleCreateClub(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    // Validate inputs
    const validation = validateCreateClubData(data);
    if (!validation.valid) {
        showAlert(validation.message);
        return;
    }
    
    // Clean the data
    data.club_code = data.club_code.trim().toUpperCase();
    data.club_name = data.club_name.trim();
    data.admin_name = data.admin_name.trim();
    
    setButtonLoading('createBtn', true);
    clearAlerts();
    
    fetch('/create_club', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        if (result.success) {
            showAlert('Club created successfully! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            showAlert(result.error || 'Failed to create club. Please try again.');
            setButtonLoading('createBtn', false);
        }
    })
    .catch(error => {
        console.error('Create club error:', error);
        showAlert('Connection error. Please check your internet connection and try again.');
        setButtonLoading('createBtn', false);
    });
}

/**
 * Alert management
 */
function showAlert(message, type = 'danger') {
    clearAlerts();
    const alertContainer = document.getElementById('alertContainer');
    
    if (!alertContainer) {
        console.error('Alert container not found');
        // Fallback to console and browser alert
        console.log(`Alert (${type}): ${message}`);
        if (type === 'danger') {
            alert(message);
        }
        return;
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} fade-in`;
    alertDiv.innerHTML = `
        <i class="fas fa-${getAlertIcon(type)}"></i>
        ${message}
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
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

function clearAlerts() {
    const alertContainer = document.getElementById('alertContainer');
    if (alertContainer) {
        alertContainer.innerHTML = '';
    }
}

/**
 * Button state management
 */
function setButtonLoading(buttonId, loading) {
    const btn = document.getElementById(buttonId);
    if (!btn) {
        console.error(`Button with id ${buttonId} not found`);
        return;
    }
    
    const textSpan = btn.querySelector('.btn-text');
    const loadingSpan = btn.querySelector('.btn-loading');
    
    btn.disabled = loading;
    
    if (textSpan) textSpan.style.display = loading ? 'none' : 'flex';
    if (loadingSpan) loadingSpan.style.display = loading ? 'flex' : 'none';
}

/**
 * Validation functions
 */
function validateCreateClubData(data) {
    if (!data.club_code || !data.club_code.trim()) {
        return { valid: false, message: 'Please enter a club code' };
    }
    
    if (!data.club_name || !data.club_name.trim()) {
        return { valid: false, message: 'Please enter a club name' };
    }
    
    if (!data.admin_name || !data.admin_name.trim()) {
        return { valid: false, message: 'Please enter your name' };
    }
    
    // Validate club code format
    const clubCodePattern = /^[A-Za-z0-9]+$/;
    if (!clubCodePattern.test(data.club_code.trim())) {
        return { valid: false, message: 'Club code can only contain letters and numbers' };
    }
    
    if (data.club_code.trim().length > 20) {
        return { valid: false, message: 'Club code must be 20 characters or less' };
    }
    
    if (data.club_name.trim().length > 100) {
        return { valid: false, message: 'Club name must be 100 characters or less' };
    }
    
    if (data.admin_name.trim().length > 100) {
        return { valid: false, message: 'Admin name must be 100 characters or less' };
    }
    
    // Check for reserved codes
    const reservedCodes = ['DEMO123', 'ADMIN', 'TEST', 'API'];
    if (reservedCodes.includes(data.club_code.trim().toUpperCase())) {
        return { valid: false, message: 'This club code is reserved. Please choose a different one.' };
    }
    
    return { valid: true };
}

// Export functions for potential use in other scripts
window.LoginPage = {
    showAlert,
    clearAlerts,
    showTab,
    setButtonLoading
};

// Add global error handler for debugging
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
});

// Test function to verify the script is loaded
console.log('Login.js loaded successfully');