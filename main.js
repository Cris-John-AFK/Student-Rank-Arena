import { questions } from './questions.js';
import { getCurrentUser, authenticateUser, saveUserResult, checkPremiumStatus } from './firebase.js';

// ====== DOM Screens ======
const screens = {
    landing: document.getElementById('landing'),
    quiz: document.getElementById('quiz'),
    leaderboard: document.getElementById('leaderboard'),
    profile: document.getElementById('profile'),
    'ad-screen': document.getElementById('ad-screen'),
    calculating: document.getElementById('calculating'),
    result: document.getElementById('result')
};

const modals = {
    auth: document.getElementById('auth-modal'),
    paywall: document.getElementById('paywall-modal')
};

// ====== State ======
let currentQuestionIndex = 0;
let totalScore = 0;
let scoreHistory = [];
let isSignUpMode = true;
let finalType = '';
let finalRank = 0;
let isPremiumUser = false;
let currentUser = null;
let lbCurrentTab = 'top';

// ====== Mock Leaderboard Data ======
const mockLeaderboard = {
    top: [
        { name: 'Alessandra R.', type: 'Academic Weapon 🔥', score: 38 },
        { name: 'Miguel T.',      type: 'Overachiever 🧠',    score: 41 },
        { name: 'Bianca L.',      type: 'Silent Genius 🤫',   score: 45 },
        { name: 'Jeron C.',       type: 'Consistent Grinder 📚', score: 52 },
        { name: 'Sofia M.',       type: 'Consistent Grinder 📚', score: 57 },
        { name: '???',            type: '??? (Premium)',       score: 61 },
        { name: '???',            type: '??? (Premium)',       score: 65 },
    ],
    chaos: [
        { name: 'UNKNOWN_404',    type: 'Academic Menace 😈',  score: 98 },
        { name: 'BahalaNa0o',     type: 'Bahala Na Player 🎲', score: 95 },
        { name: 'GhostMode99',    type: 'Ghost Student 👻',    score: 93 },
        { name: 'CrammerKing',    type: 'Last-Minute Hero ⚡',  score: 90 },
        { name: 'ExcuseQueen',    type: 'Excuse Master 📝',    score: 88 },
        { name: '???',            type: '??? (Premium)',       score: 86 },
        { name: '???',            type: '??? (Premium)',       score: 84 },
    ]
};

// ====== Init ======
function init() {
    currentUser = getCurrentUser();
    updateLandingUI();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('start-btn').addEventListener('click', startQuiz);
    document.getElementById('leaderboard-btn').addEventListener('click', openLeaderboard);
    document.getElementById('login-guest-btn').addEventListener('click', () => {
        if (currentUser) {
            openProfile();
        } else {
            isSignUpMode = true;
            resetAuthModal();
            showModal('auth');
        }
    });
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('prev-btn').addEventListener('click', handlePrevious);
    document.getElementById('unlock-stats-btn').addEventListener('click', () => showModal('paywall'));
    document.getElementById('share-btn').addEventListener('click', shareResult);
    document.getElementById('save-result-btn').addEventListener('click', handleSaveResult);
    document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
    document.getElementById('checkout-btn').addEventListener('click', handleCheckout);
    document.getElementById('skip-ad-btn').addEventListener('click', skipAd);
    document.getElementById('remove-ads-btn').addEventListener('click', () => showModal('paywall'));

    document.getElementById('back-from-leaderboard').addEventListener('click', () => showScreen('landing'));
    document.getElementById('back-from-profile').addEventListener('click', () => showScreen('landing'));
    document.getElementById('profile-retake-btn').addEventListener('click', () => { showScreen('landing'); startQuiz(); });
    document.getElementById('profile-upgrade-btn').addEventListener('click', () => showModal('paywall'));
    document.getElementById('lb-unlock-btn').addEventListener('click', () => showModal('paywall'));

    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', closeAllModals));

    document.querySelectorAll('.pricing-card').forEach(card => {
        card.addEventListener('click', (e) => {
            document.querySelectorAll('.pricing-card').forEach(c => c.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });

    document.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            lbCurrentTab = e.currentTarget.dataset.tab;
            renderLeaderboard(lbCurrentTab);
        });
    });
}

// ====== UI Helpers ======
function showScreen(screenId) {
    Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
    if (screens[screenId]) screens[screenId].classList.add('active');
}

function showModal(modalId) { modals[modalId].classList.add('visible'); }
function closeAllModals() { Object.values(modals).forEach(m => m.classList.remove('visible')); }

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 3000);
}

function updateLandingUI() {
    const greeting = document.getElementById('user-greeting');
    const loginBtn = document.getElementById('login-guest-btn');
    if (currentUser) {
        const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Student';
        document.getElementById('greeting-name').textContent = `Welcome back, ${name}! 👋`;
        greeting.style.display = 'block';
        loginBtn.textContent = '👤 My Profile';
    } else {
        greeting.style.display = 'none';
        loginBtn.textContent = '👤 Login / Register';
    }
}

function handleLogout() {
    localStorage.removeItem('mockUser');
    localStorage.removeItem('studentResults');
    currentUser = null;
    isPremiumUser = false;
    updateLandingUI();
    showToast('Logged out successfully.');
}

// ====== Leaderboard ======
function openLeaderboard() {
    showScreen('leaderboard');
    renderLeaderboard('top');
}

function renderLeaderboard(tab) {
    const list = document.getElementById('leaderboard-list');
    const teaser = document.getElementById('lb-premium-teaser');
    const data = mockLeaderboard[tab];
    
    list.innerHTML = '';

    const visibleCount = isPremiumUser ? data.length : 5;

    data.slice(0, visibleCount).forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const isLocked = entry.name === '???';
        row.innerHTML = `
            <div class="lb-rank ${rankClass}">${medal}</div>
            <div class="lb-info">
                <div class="lb-name">${isLocked ? '🔒 Hidden (Premium)' : entry.name}</div>
                <div class="lb-type">${isLocked ? 'Unlock to reveal' : entry.type}</div>
            </div>
            <div class="lb-score" style="${isLocked ? 'filter:blur(4px)' : ''}">${entry.score}/100</div>
        `;
        list.appendChild(row);
    });

    teaser.style.display = isPremiumUser ? 'none' : 'block';
}

// ====== Profile ======
function openProfile() {
    if (!currentUser) { showModal('auth'); return; }
    showScreen('profile');

    const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Student';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-email').textContent = currentUser.email || '';

    const badge = document.getElementById('profile-badge');
    if (isPremiumUser) {
        badge.textContent = '⭐ Premium';
        badge.style.background = 'linear-gradient(135deg, #f59e0b, #f43f5e)';
        badge.style.color = 'white';
        badge.style.border = 'none';
        document.getElementById('profile-upgrade-btn').style.display = 'none';
    } else {
        badge.textContent = 'Free';
        document.getElementById('profile-upgrade-btn').style.display = '';
    }

    // Load last result from localStorage
    const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
    const myResults = results.filter(r => r.userId === (currentUser.email || currentUser.uid));
    if (myResults.length > 0) {
        const best = myResults.reduce((a, b) => a.score < b.score ? a : b);
        document.getElementById('prof-best-score').textContent = `${best.score}/100`;
        document.getElementById('prof-best-rank').textContent = `Top ${best.rank}%`;
        document.getElementById('prof-type').textContent = best.type;
    } else {
        document.getElementById('prof-best-score').textContent = 'No quiz yet';
        document.getElementById('prof-best-rank').textContent = '—';
        document.getElementById('prof-type').textContent = '—';
    }
}

// ====== Quiz Logic ======
function startQuiz() {
    currentQuestionIndex = 0;
    totalScore = 0;
    scoreHistory = [];
    showScreen('quiz');
    renderQuestion();
}

function renderQuestion() {
    const q = questions[currentQuestionIndex];
    document.getElementById('question-count').textContent = `Question ${currentQuestionIndex + 1}/${questions.length}`;
    document.getElementById('category-label').textContent = q.category;
    document.getElementById('question-text').textContent = q.text;
    document.getElementById('progress-bar').style.width = `${(currentQuestionIndex / questions.length) * 100}%`;

    const prevBtn = document.getElementById('prev-btn');
    prevBtn.style.display = currentQuestionIndex > 0 ? 'inline-block' : 'none';

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt.text;
        btn.onclick = () => handleAnswer(opt.score);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(score) {
    totalScore += score;
    scoreHistory.push(score);
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        renderQuestion();
    } else {
        finishQuiz();
    }
}

function handlePrevious() {
    if (currentQuestionIndex > 0) {
        totalScore -= scoreHistory.pop();
        currentQuestionIndex--;
        renderQuestion();
    }
}

function finishQuiz() {
    document.getElementById('progress-bar').style.width = '100%';
    if (!isPremiumUser) {
        showScreen('ad-screen');
        startAdTimer();
    } else {
        skipAd();
    }
}

let adInterval;
function startAdTimer() {
    let timeLeft = 3;
    const skipBtn = document.getElementById('skip-ad-btn');
    skipBtn.disabled = true;
    skipBtn.innerHTML = `Skip Ad in <span id="ad-timer">${timeLeft}</span>...`;

    adInterval = setInterval(() => {
        timeLeft--;
        const timerSpan = document.getElementById('ad-timer');
        if (timeLeft > 0 && timerSpan) {
            timerSpan.textContent = timeLeft;
        } else {
            clearInterval(adInterval);
            skipBtn.disabled = false;
            skipBtn.textContent = 'Skip Ad ⏭️';
        }
    }, 1000);
}

function skipAd() {
    if (adInterval) clearInterval(adInterval);
    showScreen('calculating');
    setTimeout(() => {
        calculateResult();
        showScreen('result');
        showToast('Quiz Complete! Your rank is calculated. 🎉');
    }, 2000);
}

function calculateResult() {
    let type = '', rarity = '';
    if (totalScore <= 40) {
        type = 'The Overachiever 🧠';
        finalRank = Math.floor(Math.random() * 5) + 1;
        rarity = 'Top 1% Academic Weapon 🔥';
    } else if (totalScore <= 60) {
        type = 'The Consistent Grinder 📚';
        finalRank = Math.floor(Math.random() * 15) + 5;
    } else if (totalScore <= 75) {
        type = 'The Chill Passer 😌';
        finalRank = Math.floor(Math.random() * 20) + 20;
        if (Math.random() > 0.8) rarity = 'Silent Genius 🤫';
    } else if (totalScore <= 90) {
        type = 'The Crammer 💀';
        finalRank = Math.floor(Math.random() * 30) + 40;
        if (Math.random() > 0.8) rarity = 'Deadline Bender ⏳';
    } else {
        type = 'Ghost Student 👻 (Chaos Tier)';
        finalRank = Math.floor(Math.random() * 20) + 70;
        rarity = 'Academic Menace 😈';
    }

    finalType = rarity || type;
    document.getElementById('result-type').textContent = finalType;
    document.getElementById('result-score').textContent = `${totalScore}/100`;
    document.getElementById('result-rank').textContent = `Top ${finalRank}%`;
    document.getElementById('better-than').textContent = `${100 - finalRank}%`;
}

// ====== Save + Share ======
async function handleSaveResult() {
    if (!currentUser) { showModal('auth'); return; }
    const success = await saveUserResult(totalScore, finalType, finalRank);
    if (success) {
        showToast('Rank saved to Leaderboard! 🏆');
        document.getElementById('save-result-btn').textContent = 'Saved ✓';
        document.getElementById('save-result-btn').disabled = true;
    } else {
        showToast('Error saving rank.');
    }
}

function shareResult() {
    const text = `I'm ${finalType} (Top ${finalRank}%)\nScore: ${totalScore}/100 on Student Rank Arena!\nCan you beat me? 👀\n${window.location.href}`;
    if (navigator.share) {
        navigator.share({ title: 'Student Rank Arena', text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text);
        document.getElementById('share-btn').textContent = 'Copied! ✓';
        setTimeout(() => { document.getElementById('share-btn').textContent = 'Share Result 🔗'; }, 2000);
        showToast('Result copied to clipboard!');
    }
}

// ====== Auth ======
function resetAuthModal() {
    document.getElementById('auth-title').textContent = 'Create Account';
    document.getElementById('auth-subtitle').textContent = 'Join the arena and track your rank!';
    document.getElementById('auth-submit-btn').textContent = 'Sign Up';
    document.getElementById('toggle-auth-mode').textContent = 'Already have an account? Log In';
    document.getElementById('name-input').parentElement.style.display = 'block';
    document.getElementById('auth-form').reset();
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('auth-title').textContent = isSignUpMode ? 'Create Account' : 'Welcome Back';
    document.getElementById('auth-subtitle').textContent = isSignUpMode
        ? 'Join the arena and track your rank!'
        : 'Login to see your profile and leaderboard.';
    document.getElementById('auth-submit-btn').textContent = isSignUpMode ? 'Sign Up' : 'Log In';
    document.getElementById('toggle-auth-mode').textContent = isSignUpMode
        ? 'Already have an account? Log In'
        : 'Need an account? Sign up';
    document.getElementById('name-input').parentElement.style.display = isSignUpMode ? 'block' : 'none';
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const displayName = document.getElementById('name-input').value || email.split('@')[0];

    const btn = document.getElementById('auth-submit-btn');
    btn.textContent = 'Please wait...';
    btn.disabled = true;

    const res = await authenticateUser(email, password, isSignUpMode, displayName);

    btn.disabled = false;
    btn.textContent = isSignUpMode ? 'Sign Up' : 'Log In';

    if (res.success) {
        currentUser = getCurrentUser();
        // 🔑 Check if user is Premium in Firestore
        const userEmail = currentUser?.email || email;
        isPremiumUser = await checkPremiumStatus(userEmail);
        if (isPremiumUser) {
            document.querySelectorAll('.ad-space').forEach(el => el.classList.add('premium-hidden'));
            showToast('⭐ Welcome back, Premium member!');
        }

        closeAllModals();
        updateLandingUI();
        showToast(isSignUpMode ? '🎉 Account created! Welcome!' : '👋 Welcome back!');
        if (totalScore > 0) handleSaveResult();
    } else {
        showToast(`❌ ${res.error}`);
    }
}

// ====== Premium / Checkout ======
function handleCheckout() {
    const activePlan = document.querySelector('.pricing-card.active')?.dataset.plan || 'lifetime';
    const paymongoLink = import.meta.env.VITE_PAYMONGO_LINK || '';

    showToast('Redirecting to PayMongo secure checkout... 💳');

    setTimeout(() => {
        if (paymongoLink) {
            window.location.href = paymongoLink;
        } else {
            closeAllModals();
            showToast('🔓 [DEV MODE] Premium Unlocked!');
            isPremiumUser = true;
            document.querySelectorAll('.ad-space').forEach(el => el.classList.add('premium-hidden'));
            updateLandingUI();
            if (screens['ad-screen']?.classList.contains('active')) skipAd();
        }
    }, 1200);
}

// ====== Boot ======
init();
