import { questions } from './questions.js';
import { getCurrentUser, authenticateUser, saveUserResult } from './firebase.js';

// DOM Elements
const screens = {
    landing: document.getElementById('landing'),
    quiz: document.getElementById('quiz'),
    'ad-screen': document.getElementById('ad-screen'),
    calculating: document.getElementById('calculating'),
    result: document.getElementById('result')
};

const modals = {
    auth: document.getElementById('auth-modal'),
    paywall: document.getElementById('paywall-modal')
};

// State
let currentQuestionIndex = 0;
let totalScore = 0;
let scoreHistory = [];
let isSignUpMode = true;
let finalType = '';
let finalRank = 0;
let isPremiumUser = false;

// Init Event Listeners
document.getElementById('start-btn').addEventListener('click', startQuiz);
document.getElementById('prev-btn').addEventListener('click', handlePrevious);
document.getElementById('login-guest-btn').addEventListener('click', () => showModal('auth'));
document.getElementById('unlock-stats-btn').addEventListener('click', () => showModal('paywall'));
document.getElementById('share-btn').addEventListener('click', shareResult);
document.getElementById('save-result-btn').addEventListener('click', handleSaveResult);
document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
document.getElementById('checkout-btn').addEventListener('click', handleCheckout);

document.getElementById('skip-ad-btn').addEventListener('click', skipAd);
document.getElementById('remove-ads-btn').addEventListener('click', () => showModal('paywall'));

document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        closeAllModals();
    });
});

document.querySelectorAll('.pricing-card').forEach(card => {
    card.addEventListener('click', (e) => {
        document.querySelectorAll('.pricing-card').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
    });
});

function showScreen(screenId) {
    Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
    if (screens[screenId]) screens[screenId].classList.add('active');
}

function showModal(modalId) {
    modals[modalId].classList.add('visible');
}

function closeAllModals() {
    Object.values(modals).forEach(m => m.classList.remove('visible'));
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        if(container.contains(toast)) container.removeChild(toast);
    }, 3000);
}

// Quiz Logic
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
    
    document.getElementById('progress-bar').style.width = `${((currentQuestionIndex) / questions.length) * 100}%`;
    
    const prevBtn = document.getElementById('prev-btn');
    if (currentQuestionIndex > 0) {
        prevBtn.style.display = 'inline-block';
    } else {
        prevBtn.style.display = 'none';
    }
    
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
        const lastScore = scoreHistory.pop();
        totalScore -= lastScore;
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
        if(timeLeft > 0 && timerSpan) {
            timerSpan.textContent = timeLeft;
        } else {
            clearInterval(adInterval);
            skipBtn.disabled = false;
            skipBtn.textContent = "Skip Ad ⏭️";
        }
    }, 1000);
}

function skipAd() {
    if(adInterval) clearInterval(adInterval);
    showScreen('calculating');
    
    setTimeout(() => {
        calculateResult();
        showScreen('result');
        triggerConfetti();
    }, 2000);
}

function calculateResult() {
    // Score logic based on USER prompt
    // Min score = 25, Max = 100
    
    let type = "";
    let rarity = "";
    
    if (totalScore <= 40) {
        type = "The Overachiever 🧠";
        finalRank = Math.floor(Math.random() * 5) + 1; // Top 1-5%
        rarity = "Top 1% Academic Weapon 🔥";
    } else if (totalScore <= 60) {
        type = "The Consistent Grinder 📚";
        finalRank = Math.floor(Math.random() * 15) + 5; // Top 5-20%
    } else if (totalScore <= 75) {
        type = "The Chill Passer 😌";
        finalRank = Math.floor(Math.random() * 20) + 20; // Top 20-40%
        if(Math.random() > 0.8) rarity = "Silent Genius 🤫";
    } else if (totalScore <= 90) {
        type = "The Crammer 💀";
        finalRank = Math.floor(Math.random() * 30) + 40; // Top 40-70%
        if(Math.random() > 0.8) rarity = "Deadline Bender ⏳";
    } else {
        type = "The Ghost Student 👻 (Chaos Tier)";
        finalRank = Math.floor(Math.random() * 20) + 70; // Top 70-90%
        rarity = "Academic Menace 😈";
    }
    
    finalType = rarity ? rarity : type;
    
    document.getElementById('result-type').textContent = finalType;
    document.getElementById('result-score').textContent = `${totalScore}/100`;
    document.getElementById('result-rank').textContent = `Top ${finalRank}%`;
    
    // Locked stats
    const betterThan = 100 - finalRank;
    document.getElementById('better-than').textContent = `${betterThan}%`;
}

function triggerConfetti() {
    // A simple mock of confetti by injecting colored dots, 
    // but we will keep it simple. Real confetti would use canvas.
    showToast("Quiz Complete! Your rank is calculated.");
}

async function handleSaveResult() {
    const user = getCurrentUser();
    if (!user) {
        showModal('auth');
        return;
    }
    
    const success = await saveUserResult(totalScore, finalType, finalRank);
    if (success) {
        showToast("Rank saved to Leaderboard! 🏆");
        document.getElementById('save-result-btn').textContent = "Saved ✓";
        document.getElementById('save-result-btn').disabled = true;
    } else {
        showToast("Error saving rank.");
    }
}

function shareResult() {
    const text = `I'm ${finalType} 💀 (Top ${finalRank}%)\nScore: ${totalScore}/100 on Student Rank Arena!\nCan you beat me? 👀`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Student Rank Arena',
            text: text,
            url: window.location.href
        }).catch(err => console.log('Share error:', err));
    } else {
        navigator.clipboard.writeText(text);
        document.getElementById('share-btn').textContent = "Copied to clipboard! ✓";
        setTimeout(() => {
            document.getElementById('share-btn').textContent = "Share Result 🔗";
        }, 2000);
        showToast("Result copied to clipboard!");
    }
}

// Auth Handlers
function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('auth-title').textContent = isSignUpMode ? "Save Your Rank" : "Welcome Back";
    document.getElementById('auth-subtitle').textContent = isSignUpMode ? 
        "Create an account to track your improvement and appear on the leaderboard!" : 
        "Login to view your premium Dashboard and rankings.";
    document.getElementById('auth-submit-btn').textContent = isSignUpMode ? "Sign Up" : "Log In";
    document.getElementById('toggle-auth-mode').textContent = isSignUpMode ? 
        "Already have an account? Log In" : "Need an account? Sign up";
        
    const nameInput = document.getElementById('name-input').parentElement;
    nameInput.style.display = isSignUpMode ? 'block' : 'none';
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const displayName = document.getElementById('name-input').value;
    
    const res = await authenticateUser(email, password, isSignUpMode, displayName);
    if (res.success) {
        closeAllModals();
        showToast("Successfully authenticated!");
        if (totalScore > 0) {
            handleSaveResult(); // Auto save if they were just taking the quiz
        }
    } else {
        showToast(`Error: ${res.error}`);
    }
}

// Payment/Subscription Handle
function handleCheckout() {
    const activePlan = document.querySelector('.pricing-card.active').dataset.plan;
    const xenditPaymentLink = import.meta.env.VITE_XENDIT_LINK || ""; 
    
    showToast(`Initializing Xendit Secure Checkout...`);
    
    setTimeout(() => {
        if (xenditPaymentLink !== "") {
            // In Production, redirect the user securely to Xendit
            window.location.href = xenditPaymentLink;
        } else {
            // Dev Mode Mock
            closeAllModals();
            showToast('🔓 [DEV MODE] Mock Payment Success! Premium Unlocked.');
            isPremiumUser = true;
            document.querySelectorAll('.ad-space').forEach(el => el.classList.add('premium-hidden'));
            
            // If they unlocked from the ad screen, skip the ad automatically
            if (screens['ad-screen'].classList.contains('active')) {
                skipAd();
            }
        }
    }, 1500);
}
