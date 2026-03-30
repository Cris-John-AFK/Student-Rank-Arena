import { questions } from './questions.js';
import { studentTypesDict } from './studentTypes.js';
import { onUserStateChange, authenticateUser, saveUserResult, checkPremiumStatus, isFirebaseConfigured, getCurrentUser, fetchLeaderboard, fetchUserResults, getUserProfileData, fetchLeaderboardAround, getUserEloRank, getPersistentId, db } from './firebase.js';
import { initVersus } from './versus.js';

// ====== DOM Screens ======
const screens = {
    landing: document.getElementById('landing'),
    quiz: document.getElementById('quiz'),
    leaderboard: document.getElementById('leaderboard'),
    profile: document.getElementById('profile'),
    'ad-screen': document.getElementById('ad-screen'),
    calculating: document.getElementById('calculating'),
    result: document.getElementById('result'),
    'versus-lobby': document.getElementById('versus-lobby'),
    'versus-quiz': document.getElementById('versus-quiz'),
    'versus-result': document.getElementById('versus-result')
};

const modals = {
    auth: document.getElementById('auth-modal'),
    paywall: document.getElementById('paywall-modal'),
    'vs-choice': document.getElementById('vs-choice-modal'),
    'vs-join': document.getElementById('vs-join-modal')
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
    initVersus();

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
    document.getElementById('exit-quiz-btn').addEventListener('click', () => { if(confirm('Exit quiz? Progress will not be saved.')) showScreen('landing'); });

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

    // Guest Modal setup
    modals['guest'] = document.getElementById('guest-modal');
    modals['edit-profile'] = document.getElementById('edit-profile-modal');
    modals['public-profile'] = document.getElementById('public-profile-modal');

    document.querySelector('.close-guest-btn').addEventListener('click', () => {
        modals['guest'].classList.remove('visible');
    });
    document.getElementById('guest-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        let guestNick = document.getElementById('guest-name-input').value.trim();
        if (!guestNick) guestNick = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
        
        modals['guest'].classList.remove('visible');
        await completeSaveResult(guestNick);
    });

    // Edit Profile Modal
    document.getElementById('edit-profile-btn').addEventListener('click', openEditProfileModal);
    document.getElementById('close-edit-btn').addEventListener('click', () => modals['edit-profile'].classList.remove('visible'));
    document.getElementById('edit-profile-form').addEventListener('submit', handleSaveProfileEdit);

    // Public Profile Modal
    document.getElementById('close-public-btn').addEventListener('click', () => modals['public-profile'].classList.remove('visible'));
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
    renderLeaderboard('top'); // Default to 'top' tab
}

async function renderLeaderboard(tab) {
    const list = document.getElementById('leaderboard-list');
    const teaser = document.getElementById('lb-premium-teaser');
    list.innerHTML = '<div class="lb-loading">Fetching real rankings...</div>';

    const myId = currentUser?.email || localStorage.getItem('myArenaId');
    let displayData = [];

    if (tab === 'elo') {
        const profile = await getUserProfileData(currentUser?.email);
        const myElo = profile?.elo || 500;
        
        const [top3, aroundMe, myRank] = await Promise.all([
            fetchLeaderboard('elo', 3),
            fetchLeaderboardAround('elo', myElo, 3),
            getUserEloRank(myElo)
        ]);

        // Merge + Strict Local Deduplication (by ID AND Nickname)
        const seenNames = new Set();
        const seenIds = new Set();
        displayData = [];

        [...top3, ...aroundMe].forEach(d => {
            const name = (d.displayName || "Unknown").toLowerCase();
            const id = d.userId || d.id;
            if (!seenNames.has(name) && !seenIds.has(id)) {
                seenNames.add(name);
                seenIds.add(id);
                displayData.push(d);
            }
        });
        
        displayData.sort((a, b) => (b.elo || 500) - (a.elo || 500));

        // Rank the slice sequentially
        const myIndex = displayData.findIndex(d => (d.userId === myId || d.id === myId));
        if (myIndex !== -1 && myRank) {
            displayData.forEach((d, i) => {
                d.absoluteRank = myRank + (i - myIndex);
            });
        }
    } else {
        const raw = await fetchLeaderboard('score', 50);
        // Deduplicate score list by name as well
        const seen = new Set();
        displayData = raw.filter(d => {
            const n = (d.displayName || "Unknown").toLowerCase();
            if (seen.has(n)) return false;
            seen.add(n);
            return true;
        });
    }
    
    list.innerHTML = '';
    
    // Custom row creator
    const createRowHTML = (entry, index, isMe) => {
        const isEloTab = tab === 'elo';
        const rankValue = isEloTab ? (entry.elo || 500) : `${entry.score}/100`;
        
        let medal = `#${index + 1}`;
        if (isEloTab) {
            // Priority: use the calculated sequential rank based on the sorted array
            medal = `#${index + 1}`;
            // If we have an absolute rank offset from the world count, apply it
            if (entry.absoluteRank) {
                medal = `#${entry.absoluteRank}`;
            }
        } else if (index < 3) {
            medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        }

        let nameDisplay = entry.displayName || "Unknown";
        if (isMe) nameDisplay += " (You)";

        const isCreator = entry.achievement?.includes('The Creator') || entry.type?.includes('The Creator');
        const isExtreme = entry.achievement?.includes('The Extreme') || entry.type?.includes('The Extreme');
        const isVoid = entry.achievement?.includes('The Void Master') || entry.type?.includes('The Void Master');
        
        let devClass = isCreator ? 'creator-border' : isExtreme ? 'extreme-border' : isVoid ? 'void-border' : '';
        let displayType = (entry.score !== undefined && studentTypesDict[entry.score])
            ? studentTypesDict[entry.score].type
            : (entry.type || '—');

        return `
            <div class="lb-row ${entry.isPremium ? 'premium-row' : ''} ${isMe ? 'highlight-me' : ''} ${devClass}" 
                 onclick='window._openPublicProfile(${JSON.stringify({...entry, absoluteRank: (entry.absoluteRank || (index+1))}).replace(/'/g, "&apos;")})'>
                <div class="lb-rank">${medal}</div>
                <div class="lb-info">
                    <div class="lb-name">${nameDisplay} ${entry.isPremium ? '⭐' : ''}</div>
                    <div class="lb-type">${isEloTab ? '🧠 Elo Knowledge' : displayType}</div>
                </div>
                <div class="lb-score" style="color:${isEloTab?'var(--accent)':'white'};">${rankValue}</div>
            </div>
        `;
    };

    let html = '';
    displayData.forEach((entry, i) => {
        // Add a spacer if there's a gap between top 3 and the rest in Elo tab
        if (tab === 'elo' && i === 3 && displayData.length > 3) {
            html += `<div style="text-align:center; color:var(--text-muted); font-size: 0.8rem; margin: 10px 0;">••• SLICE AROUND YOU •••</div>`;
        }
        html += createRowHTML(entry, i, (entry.userId === myId || entry.id === myId));
    });

    list.innerHTML = html;
    teaser.style.display = 'none';
}

// ====== Achievements Section Renderer ======
function getRarity(score) {
    if (score >= 90) return { label: 'Legendary ✨', color: '#ffd700', bg: 'rgba(255,215,0,0.15)', border: 'rgba(255,215,0,0.5)' };
    if (score >= 75) return { label: 'Epic 💜', color: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: 'rgba(192,132,252,0.5)' };
    if (score >= 55) return { label: 'Rare 💙', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.5)' };
    if (score >= 30) return { label: 'Uncommon 💚', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.4)' };
    return { label: 'Common ⚪', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' };
}

function renderAchievementsSection(gridId, barId, countId, earnedScores) {
    const grid = document.getElementById(gridId);
    const bar = document.getElementById(barId);
    const countEl = document.getElementById(countId);
    if (!grid) return;

    const rawScores = Array.isArray(earnedScores) ? earnedScores : [earnedScores];
    const earned = new Set(rawScores
        .map(s => parseInt(s))
        .filter(s => !isNaN(s) && s >= 0 && s <= 100)
    );
    const total = 101;
    const unlockedCount = earned.size;

    if (countEl) countEl.textContent = `${unlockedCount} / ${total}`;
    if (bar) bar.style.width = `${(unlockedCount / total) * 100}%`;

    if (unlockedCount === 0) {
        grid.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Finish a quiz to unlock types!</span>';
        return;
    }

    // Sort: unlocked first (by score desc = rarity first), then locked ???
    let unlockedHtml = '';
    let lockedHtml = '';

    for (let score = 100; score >= 0; score--) {
        const typeDef = studentTypesDict[score];
        if (!typeDef) continue;
        const isUnlocked = earned.has(score);
        if (isUnlocked) {
            const r = getRarity(score);
            unlockedHtml += `<span class="achieve-pill" style="background:${r.bg}; border-color:${r.border}; color:${r.color};" title="Score ${score}/100 · ${r.label}">${typeDef.type}</span>`;
        } else {
            lockedHtml += `<span class="achieve-pill locked" title="Score ${score}/100 — not yet discovered">???</span>`;
        }
    }
    grid.innerHTML = unlockedHtml + lockedHtml;
}

function renderAchievementBadges(containerId, achievement) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!achievement) return;
    
    let style = '';
    if (achievement.includes('The Creator')) style = 'background: linear-gradient(135deg, #ffd700, #ff8c00); color: #000; text-shadow: none; box-shadow: 0 0 20px rgba(255,215,0,0.8);';
    else if (achievement.includes('The Extreme')) style = 'background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff); color: white; animation: rgb-border 3s linear infinite; background-size: 200%;';
    else if (achievement.includes('The Void Master')) style = 'background: linear-gradient(135deg, #4c00ff, #1a0080); color: white; box-shadow: 0 0 20px rgba(76,0,255,0.9);';
    
    container.innerHTML = `<span style="display:inline-block; padding: 5px 16px; border-radius: 99px; font-size: 1rem; font-weight: 900; letter-spacing: 0.5px; ${style}">${achievement}</span>`;
}

function updateProfileStatsUI(score, rank, type, achievement, earnedScores) {
    const eloEl = document.getElementById('profile-elo');
    const wRankEl = document.getElementById('profile-world-rank');
    const bScoreEl = document.getElementById('profile-score');
    const bRankEl = document.getElementById('profile-rank');
    
    if (eloEl) {
        // Use persistent ID (Email or Guest Hash)
        const myId = getPersistentId();
        getUserProfileData(myId).then(data => {
            const elo = data?.elo || (typeof score === 'number' ? (score * 20) + 50 : 500);
            eloEl.textContent = elo;
            getUserEloRank(elo).then(wRank => {
                if (wRankEl) wRankEl.textContent = `#${wRank}`;
            });
        });
    }
    
    if (bScoreEl) bScoreEl.textContent = (score !== undefined && score !== 'No quiz yet') ? `${score}/100` : '—';
    if (bRankEl) bRankEl.textContent = rank === '—' ? rank : `Top ${rank}%`;
    
    // Always derive type live from score dictionary
    const liveType = (typeof score === 'number' && studentTypesDict[score])
        ? studentTypesDict[score].type
        : (type || '—');
    document.getElementById('prof-type').textContent = liveType;
    
    // Render exclusive dev achievement badge on top
    renderAchievementBadges('my-achievements', achievement);
    

    // Render the 101-types achievements grid
    renderAchievementsSection('my-achieve-grid', 'my-achieve-bar', 'my-achieve-count', earnedScores);
    
    const panel = document.getElementById('profile').querySelector('.glass-panel');
    panel.classList.remove('creator-border', 'extreme-border', 'void-border');
    
    const combinedStr = (liveType || '') + (achievement || '');
    if (combinedStr.includes('The Creator')) panel.classList.add('creator-border');
    else if (combinedStr.includes('The Extreme')) panel.classList.add('extreme-border');
    else if (combinedStr.includes('The Void Master')) panel.classList.add('void-border');
}

// ====== Public Profile Viewer ======
window._openPublicProfile = function(entry) {
    const modal = document.getElementById('public-profile-modal');
    if (!modal) return;

    // 1. Core Info
    const pName = document.getElementById('public-name');
    if (pName) pName.textContent = entry.displayName || 'Unknown';
    
    const liveType = (entry.score !== undefined && studentTypesDict[entry.score])
        ? studentTypesDict[entry.score].type
        : (entry.type || '—');
    const pType = document.getElementById('public-type');
    if (pType) pType.textContent = liveType;
    
    const badge = document.getElementById('public-badge');
    if (badge) {
        badge.textContent = entry.isPremium ? '⭐ Premium' : 'Free';
        badge.style.background = entry.isPremium ? 'linear-gradient(135deg, #6366f1, #ec4899)' : '';
        badge.style.color = entry.isPremium ? 'white' : '';
    }

    // 🔥 Dual-Rank Analytics Matrix (Matching the user's 2x2 drawing)
    const pElo = document.getElementById('public-elo');
    const pEloWorldRank = document.getElementById('public-world-rank');
    const pScore = document.getElementById('public-score');
    const pScoreWorldRank = document.getElementById('public-score-rank');

    const eloValue = entry.elo || 500;
    const scoreValue = entry.score !== undefined ? entry.score : 0;

    if (pElo) pElo.textContent = eloValue;
    if (pScore) pScore.textContent = `${scoreValue}/100`;

    const currentTab = document.querySelector('.lb-tab.active')?.getAttribute('data-tab') || 'score';

    // 🏆 Elo World Rank Standing
    if (pEloWorldRank) {
        if (currentTab === 'elo' && entry.absoluteRank) {
            pEloWorldRank.textContent = `#${entry.absoluteRank}`;
        } else {
            pEloWorldRank.textContent = '#—';
            getUserRankByField('elo', eloValue).then(r => { if(pEloWorldRank) pEloWorldRank.textContent = `#${r}`; });
        }
    }

    // 📝 Assessment World Rank Standing
    if (pScoreWorldRank) {
        if (currentTab === 'score' && entry.absoluteRank) {
            pScoreWorldRank.textContent = `#${entry.absoluteRank}`;
        } else {
            pScoreWorldRank.textContent = '#—';
            getUserRankByField('score', scoreValue).then(r => { if(pScoreWorldRank) pScoreWorldRank.textContent = `#${r}`; });
        }
    }

    const currentEarned = entry.earnedScores || [];
    const fallbackScore = entry.bestScore || entry.score || entry.lastScore;
    const allScores = [...new Set([...currentEarned, fallbackScore].filter(x => x !== undefined && x !== null))];

    renderAchievementsSection('public-achieve-grid', 'public-achieve-bar', 'public-achieve-count', allScores);
    
    const panel = modal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('creator-border', 'extreme-border', 'void-border');
        const combinedStr = (liveType || '') + (entry.achievement || '');
        if (combinedStr.includes('The Creator')) panel.classList.add('creator-border');
        else if (combinedStr.includes('The Extreme')) panel.classList.add('extreme-border');
        else if (combinedStr.includes('The Void Master')) panel.classList.add('void-border');
    }
    
    modal.classList.add('active');
};


// ====== Edit Profile ======
async function openEditProfileModal() {
    if (!currentUser) return;
    const modal = document.getElementById('edit-profile-modal');
    
    // Pre-fill name
    document.getElementById('edit-name-input').value = currentUser.displayName || currentUser.email?.split('@')[0] || '';
    
    // Load past titles
    const select = document.getElementById('edit-title-select');
    select.innerHTML = '<option value="">Loading...</option>';
    
    const results = await fetchUserResults(currentUser.email || currentUser.uid);
    if (results.length > 0) {
        // Collect all scores earned across history
        const scores = [...new Set(results.flatMap(r => r.earnedScores || (r.score !== undefined ? [r.score] : [])))];
        
        // Map scores back to their modern type names
        const titles = scores
            .map(s => studentTypesDict[s]?.type)
            .filter(Boolean);
        
        const uniqueTitles = [...new Set(titles)];
        select.innerHTML = uniqueTitles.map(t => `<option value="${t}">${t}</option>`).join('');
    } else {
        select.innerHTML = '<option value="">No past titles yet</option>';
    }
    
    modal.classList.add('visible');
}

async function handleSaveProfileEdit(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const newName = document.getElementById('edit-name-input').value.trim();
    const newTitle = document.getElementById('edit-title-select').value;
    
    if (!newName) { showToast('Name cannot be empty!'); return; }
    
    const btn = document.getElementById('save-profile-edit-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        // Update Firebase Auth display name
        const { updateProfile } = await import('firebase/auth');
        const { auth } = await import('./firebase.js');
        await updateProfile(auth.currentUser, { displayName: newName });
        
        // Update in Firestore results document - preserve existing 'achievement' field
        if (isFirebaseConfigured && db) {
            const { doc, updateDoc } = await import('firebase/firestore');
            const userId = currentUser.email || currentUser.uid;
            const docRef = doc(db, 'results', userId);
            const updateData = { displayName: newName };
            if (newTitle) updateData.type = newTitle;
            await updateDoc(docRef, updateData);
        }
        
        // Refresh UI
        document.getElementById('profile-name').textContent = newName;
        updateLandingUI();
        modals['edit-profile'].classList.remove('visible');
        showToast('✅ Profile updated!');
    } catch (err) {
        console.error(err);
        showToast('❌ Update failed. Try again.');
    } finally {
        btn.textContent = 'Save Changes';
        btn.disabled = false;
    }
}

// ====== Profile ======
async function openProfile() {
    showScreen('profile');
    
    const myId = getPersistentId();
    const isGuest = !myId.includes('@');

    // Clear stats while loading
    document.getElementById('profile-elo').textContent = '...';
    document.getElementById('profile-world-rank').textContent = '#...';
    document.getElementById('profile-score').textContent = '...';
    document.getElementById('profile-rank').textContent = '...';
    document.getElementById('prof-type').textContent = '...';

    // Fetch live data (Registered or Guest)
    const profile = await getUserProfileData(myId);
    
    if (profile) {
        document.getElementById('profile-name').textContent = profile.displayName || (isGuest ? "Gladiator" : myId.split('@')[0]);
        document.getElementById('profile-email').textContent = isGuest ? "Guest Participant" : myId;
        
        const badge = document.getElementById('profile-badge');
        if (profile.isPremium) {
            badge.textContent = '⭐ Premium';
            badge.style.background = 'linear-gradient(135deg, #f59e0b, #f43f5e)';
            badge.style.color = 'white';
        } else {
            badge.textContent = isGuest ? 'Guest Session' : 'Free Account';
            badge.style.background = '';
            badge.style.color = '';
        }

        const currentEarned = profile.earnedScores || [];
        const fallbackScore = profile.bestScore || profile.score || profile.lastScore;
        const allScores = [...new Set([...currentEarned, fallbackScore].filter(x => x !== undefined && x !== null))];

        updateProfileStatsUI(
            fallbackScore,
            profile.rank || profile.lastRank,
            profile.type || profile.lastType,
            profile.achievement,
            allScores
        );
    } else {
        updateProfileStatsUI('No quiz yet', '—', '—', null, []);
    }

    // Refresh Premium Plan Display
    const planInfo = document.getElementById('premium-plan-info');
    const upgradeBtn = document.getElementById('upgrade-lifetime-btn');

    if (isPremiumUser && premiumData) {
        planInfo.style.display = 'block';
        document.getElementById('plan-name').textContent = premiumData.plan === 'lifetime' ? 'Lifetime 🔥' : 'Monthly 🗓️';
        
        const daysInfo = document.getElementById('plan-days-info');
        if (premiumData.plan === 'monthly' && premiumData.expiresAt) {
            daysInfo.style.display = 'block';
            upgradeBtn.style.display = 'block';
            const now = new Date();
            const expiry = new Date(premiumData.expiresAt);
            const diffTime = Math.max(0, expiry - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            document.getElementById('plan-days-left').textContent = `${diffDays} days`;
            const percentage = Math.min(100, Math.max(0, (diffDays / 30) * 100));
            document.getElementById('plan-days-bar').style.width = `${percentage}%`;
            document.getElementById('plan-expires-on').textContent = `Renews on: ${expiry.toLocaleDateString()}`;

            upgradeBtn.onclick = () => { window.open(import.meta.env.VITE_PAYMONGO_LINK, '_blank'); };
        } else {
            daysInfo.style.display = 'none';
            upgradeBtn.style.display = 'none';
        }
    } else {
        planInfo.style.display = 'none';
    }
}

// ====== Quiz Logic ======
async function startQuiz() {
    const myId = getPersistentId();
    // 🧠 Proactive Validation Check: Ensure we have the latest accomplishments before starting
    try {
        const profile = await getUserProfileData(myId);
        if (profile && profile.earnedScores && profile.earnedScores.length > 0) {
            showToast(`Continuing journey: ${profile.earnedScores.length}/101 types discovered! 🏆`);
        }
    } catch(e) { console.warn("Background validation skipped:", e); }

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

    // 🎲 Shuffle options so option A is never predictably "the right answer"
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    shuffledOptions.forEach(opt => {
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

    const dt = studentTypesDict[totalScore] || studentTypesDict[50];
    type = dt.type;
    description = dt.desc;
    strongTrait = dt.trait;
    focus = dt.focus;
    social = dt.social;
    clutch = dt.clutch;
    
    // 🎯 Real Truth: Rank is now exactly based on score (100 = Top 1%, 0 = Top 101%)
    // No more random fluctuations!
    finalRank = 101 - totalScore; 
    proTip = totalScore > 80 ? "Keep dominating the curve!" : "Stay consistent, don't let up.";

    finalType = type;
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
async function handleSaveResult() {
    let emailKey = currentUser?.email || null;

    if (!currentUser || (currentUser?.isAnonymous && !currentUser?.displayName)) {
        // Show the beautiful modal for new unauthenticated users OR ghost sessions missing a name
        modals['guest'].classList.add('visible');
        return; // Execution stops here and waits for the modal form submission
    }

    await completeSaveResult(null); // Pass null since authenticated (either email or established guest)
}

async function completeSaveResult(guestNick) {
    const btn = document.getElementById('save-result-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const res = await saveUserResult(totalScore, finalType, finalRank, guestNick);
    
    if (res.success) {
        if (res.userId) {
            localStorage.setItem('myArenaId', res.userId);
        }
        showToast(`Rank saved as ${res.displayName}! 🏆`);
        btn.textContent = 'Go Home 🏠';
        btn.disabled = false;
        btn.onclick = () => { location.reload(); }; // Simplest way to go back home cleanly

        if (res.isNewElo || true) {
            const eloCard = document.getElementById('elo-result-card');
            if (eloCard) {
                eloCard.style.display = 'block';
                const eloVal = document.getElementById('res-elo');
                if (eloVal) eloVal.textContent = res.elo || '500';
            }
        }
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
