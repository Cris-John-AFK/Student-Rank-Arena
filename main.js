import { questions } from './questions.js';
import { onUserStateChange, authenticateUser, saveUserResult, checkPremiumStatus, isFirebaseConfigured, getCurrentUser, fetchLeaderboard, fetchUserResults, getUserProfileData } from './firebase.js';

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
let premiumData = null; 
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
    setupEventListeners();

    // ✅ Persist login: fires when Firebase restores session on page load
    onUserStateChange(async (user) => {
        currentUser = user; // 🔑 Always update global state!
        if (user) {
            premiumData = await checkPremiumStatus(user.email);
            isPremiumUser = !!premiumData;
            if (isPremiumUser) {
                document.querySelectorAll('.ad-space').forEach(el => el.classList.add('premium-hidden'));
            }
        } else {
            isPremiumUser = false;
            premiumData = null;
        }
        updateLandingUI();
    });

    // DEV/TEST: Press Ctrl+Shift+P to toggle premium without paying
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            isPremiumUser = !isPremiumUser;
            document.querySelectorAll('.ad-space').forEach(el =>
                el.classList.toggle('premium-hidden', isPremiumUser)
            );
            showToast(isPremiumUser ? '⭐ [DEV] Premium ON' : '📢 [DEV] Premium OFF');
        }
    });
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
    premiumData = null;
    updateLandingUI();
    showToast('Logged out successfully.');
}

// ====== Leaderboard ======
function openLeaderboard() {
    showScreen('leaderboard');
    renderLeaderboard('top');
}

async function renderLeaderboard(tab) {
    const list = document.getElementById('leaderboard-list');
    const teaser = document.getElementById('lb-premium-teaser');
    
    list.innerHTML = '<div class="lb-loading">Fetching real rankings...</div>';

    // Fetch up to 20 real results
    let data = await fetchLeaderboard(30);
    
    if (!data || data.length === 0) {
        list.innerHTML = '<div class="lb-loading">No results yet. Be the first! 🏆</div>';
        return;
    }

    // Filter by tab
    if (tab === 'chaos') {
        // Chaos tier are the low score students (Menaces/Crammers)
        data = data.filter(d => d.score < 50).sort((a, b) => a.score - b.score);
    } else {
        // Academic Weapons (High scores)
        data = data.filter(d => d.score >= 50).sort((a, b) => b.score - a.score);
    }

    list.innerHTML = '';
    const visibleCount = isPremiumUser ? data.length : 5;

    data.slice(0, visibleCount).forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (entry.isPremium ? ' premium-row' : '');
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        
        row.innerHTML = `
            <div class="lb-rank ${rankClass}">${medal}</div>
            <div class="lb-info">
                <div class="lb-name">${entry.displayName} ${entry.isPremium ? '⭐' : ''}</div>
                <div class="lb-type">${entry.type}</div>
            </div>
            <div class="lb-score">${entry.score}/100</div>
        `;
        list.appendChild(row);
    });

    teaser.style.display = (isPremiumUser || data.length <= 5) ? 'none' : 'block';
}

// ====== Profile ======
async function openProfile() {
    if (!currentUser) { showModal('auth'); return; }
    showScreen('profile');

    const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Student';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-email').textContent = currentUser.email || '';

    // Clear stats while loading
    document.getElementById('prof-best-score').textContent = '...';
    document.getElementById('prof-best-rank').textContent = '...';
    document.getElementById('prof-type').textContent = '...';

    const badge = document.getElementById('profile-badge');
    if (isPremiumUser) {
        badge.textContent = '⭐ Premium';
        badge.style.background = 'linear-gradient(135deg, #f59e0b, #f43f5e)';
        badge.style.color = 'white';
        badge.style.border = 'none';
        document.getElementById('profile-upgrade-btn').style.display = 'none';
    } else {
        badge.textContent = 'Free';
        badge.style.background = '';
        badge.style.color = '';
        badge.style.border = '1px solid var(--border)';
        document.getElementById('profile-upgrade-btn').style.display = '';
    }

    // Load real results from Firestore
    let myResults = [];
    if (isFirebaseConfigured) {
        myResults = await fetchUserResults(currentUser.email);
    } else {
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        myResults = results.filter(r => r.userId === (currentUser.email || currentUser.uid));
    }

    if (myResults.length > 0) {
        // Find best score (lowest score is best in our ranking)
        const best = myResults.reduce((a, b) => a.score < b.score ? a : b);
        document.getElementById('prof-best-score').textContent = `${best.score}/100`;
        document.getElementById('prof-best-rank').textContent = `Top ${best.rank}%`;
        document.getElementById('prof-type').textContent = best.type;
    } else {
        // 🔑 Second chance: check their direct user document
        const userData = await getUserProfileData(currentUser.email);
        if (userData && (userData.lastScore !== undefined)) {
            document.getElementById('prof-best-score').textContent = `${userData.lastScore}/100`;
            document.getElementById('prof-best-rank').textContent = `Top ${userData.lastRank}%`;
            document.getElementById('prof-type').textContent = userData.lastType || '—';
        } else {
            document.getElementById('prof-best-score').textContent = 'No quiz yet';
            document.getElementById('prof-best-rank').textContent = '—';
            document.getElementById('prof-type').textContent = '—';
        }
    }

    // Refresh Premium Plan Display
    const planInfo = document.getElementById('premium-plan-info');
    if (isPremiumUser && premiumData) {
        planInfo.style.display = 'block';
        document.getElementById('plan-name').textContent = premiumData.plan === 'lifetime' ? 'Lifetime 🔥' : 'Monthly 🗓️';
        
        const daysInfo = document.getElementById('plan-days-info');
        if (premiumData.plan === 'monthly' && premiumData.expiresAt) {
            daysInfo.style.display = 'block';
            const now = new Date();
            const expiry = new Date(premiumData.expiresAt);
            const diffTime = Math.max(0, expiry - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            document.getElementById('plan-days-left').textContent = `${diffDays} days`;
            const percentage = Math.min(100, Math.max(0, (diffDays / 30) * 100));
            document.getElementById('plan-days-bar').style.width = `${percentage}%`;
            document.getElementById('plan-expires-on').textContent = `Renews on: ${expiry.toLocaleDateString()}`;
        } else {
            daysInfo.style.display = 'none';
        }
    } else {
        planInfo.style.display = 'none';
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
    let type = '', rarity = '', description = '', focus = 0, social = 0, clutch = 0, strongTrait = '';
    let proTip = '';

    // 🔥 NEW SCORING: High Score = Academic Weapon (100)
    if (totalScore >= 85) {
        type = 'Academic Weapon 🔥';
        finalRank = Math.floor(Math.random() * 5) + 1;
        rarity = finalRank === 1 ? 'Diamond Tier 💎 (One of a Kind)' : 'Legendary 🌟';
        description = "You're a rare breed of student who balances discipline with raw ambition. You don't just pass; you dominate. Your focus is legendary.";
        focus = 95; social = 50; clutch = 40; strongTrait = 'Discipline 🛡️';
        proTip = "Take breaks! Even weapons need maintenance to avoid burnout.";
    } else if (totalScore >= 70) {
        type = 'The Overachiever 🧠';
        finalRank = Math.floor(Math.random() * 10) + 5;
        rarity = 'Top-Tier 🥇';
        description = "Solid, reliable, and hardworking. You might not be a 'genius' in your own eyes, but your consistency puts you ahead of 80% of students.";
        focus = 85; social = 60; clutch = 30; strongTrait = 'Consistency 📈';
        proTip = "Try teaching others what you learn; it will solidify your top-tier rank.";
    } else if (totalScore >= 45) {
        type = 'The Consistent Grinder 📚';
        finalRank = Math.floor(Math.random() * 20) + 20;
        rarity = 'Uncommon ✨';
        description = "You have the talent but prefer the easy life. You do 'just enough' to stay safe. You're the master of the minimum effort, maximum result.";
        focus = 70; social = 85; clutch = 60; strongTrait = 'Efficiency ⚡';
        proTip = "Imagine what you could do if you gave just 10% more effort.";
    } else if (totalScore >= 20) {
        type = 'The Chill Passer 😌';
        finalRank = Math.floor(Math.random() * 30) + 40;
        rarity = 'Common 📉';
        description = "Living on the edge! You ignore everything for 3 weeks and then finish the whole semester in one night of pure adrenaline.";
        focus = 40; social = 40; clutch = 90; strongTrait = 'Clutch Chaos 🎢';
        proTip = "Your heart won't last forever at this rate; start 2 days earlier next time.";
    } else {
        type = 'Chaos Tier Ghost 👻';
        finalRank = Math.floor(Math.random() * 20) + 75;
        rarity = 'Low Stakes 🍃';
        description = "A true chaos tier student. You probably aren't even sure what course you're taking, yet somehow you're still here. Respect.";
        focus = 10; social = 95; clutch = 100; strongTrait = 'Pure Luck 🍀';
        proTip = "Check your email. Seriously. There are probably 50 missed deadlines.";
    }

    finalType = rarity || type;
    document.getElementById('result-type').textContent = finalType;
    document.getElementById('result-score').textContent = `${totalScore}/100`;
    document.getElementById('result-rank').textContent = `Top ${finalRank}%`;
    document.getElementById('better-than').textContent = `${100 - finalRank}%`;

    // Detailed Analytics (Premium Only)
    document.getElementById('strong-trait-preview').textContent = strongTrait;
    document.getElementById('detailed-analysis-text').textContent = description;
    document.getElementById('pro-tip-text').textContent = proTip;
    
    // Bars
    document.getElementById('trait-focus-val').textContent = focus + '%';
    document.getElementById('trait-focus-bar').style.width = focus + '%';
    document.getElementById('trait-social-val').textContent = social + '%';
    document.getElementById('trait-social-bar').style.width = social + '%';
    document.getElementById('trait-clutch-val').textContent = clutch + '%';
    document.getElementById('trait-clutch-bar').style.width = clutch + '%';

    // Toggle Premium View
    const lockedDiv = document.getElementById('result-locked-preview');
    const premiumDiv = document.getElementById('result-premium-stats');
    
    if (isPremiumUser) {
        lockedDiv.style.display = 'none';
        premiumDiv.style.display = 'block';
    } else {
        lockedDiv.style.display = 'block';
        premiumDiv.style.display = 'none';
    }
}

// ====== Save + Share ======
// ====== Save + Share ======
async function handleSaveResult() {
    let guestNick = null;
    let emailKey = currentUser?.email || null;

    if (!currentUser) {
        guestNick = prompt("Enter a nickname to show on the leaderboard (leave blank for Guest):");
        if (guestNick === null) return; // User cancelled prompt
        if (!guestNick) guestNick = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const btn = document.getElementById('save-result-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const res = await saveUserResult(totalScore, finalType, finalRank, guestNick);
    
    if (res.success) {
        showToast(`Rank saved as ${res.displayName}! 🏆`);
        btn.textContent = 'Go Home 🏠';
        btn.disabled = false;
        btn.onclick = () => { location.reload(); }; // Simplest way to go back home cleanly
    } else {
        showToast('Error saving rank.');
        btn.disabled = false;
        btn.textContent = originalText;
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
        currentUser = res.user;
        // 🔑 Check if user is Premium in Firestore
        const userEmail = currentUser?.email || email;
        premiumData = await checkPremiumStatus(userEmail);
        isPremiumUser = !!premiumData;
        
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
