import { questions } from './questions.js';
import { ARENA_QUESTIONS } from './arena_questions.js';
import { db, auth, isFirebaseConfigured, getPersistentId, getUserProfileData } from './firebase.js';
import { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc, serverTimestamp, query, where, limit, getDocs, deleteField, FieldPath, runTransaction } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

let currentRoomId = null;
let roomListener = null;
let myPlayerId = null;
let isHost = false;
let vsTimerInterval = null;
let vsQuestions = [];
let vsCurrentIndex = 0;
let vsScore = 0;
let vsOpponentScore = 0;
let vsStatus = 'idle'; // idle, matching, lobby, playing, finished
let timeLeft = 8; // Reset to 8 seconds for VS mode
let isLocalAnswered = false; // 🛡️ Prevent double-submission when keeping timer alive
let antiHangInterval = null;
let vsCorrectCount = 0;
let isAdvancingRound = false; // Safety lock to prevent double-skipping/freezing
let latestRoomData = null; // Global reference for the watchdog to avoid stale closure hanging
let mmSearchSecs = 0;
let mmTimerInterval = null;
let mmHeartbeatInterval = null;
let currentMMQueueRef = null;
let isSoloAI = false;
let aiDifficulty = 'medium'; // easy, medium, hard
let aiTimer = null;

const BATTLE_TOPICS = [
    { id: "ph_history", type: "local", name: "Philippine History", icon: "🇵🇭" },
    { id: "geography_ph", type: "local", name: "PH Geography", icon: "🗺️" },
    { id: 18, type: "api", name: "Computer Science", icon: "💻" },
    { id: 19, type: "api", name: "Mathematics", icon: "➕" },
    { id: 17, type: "api", name: "Science & Nature", icon: "🔬" },
    { id: 9, type: "api", name: "General Knowledge", icon: "🌏" }
];

// DOM Helper
const screens = {
    landing: document.getElementById('landing'),
    lobby: document.getElementById('versus-lobby'),
    quiz: document.getElementById('versus-quiz'),
    result: document.getElementById('versus-result'),
    'blitz-quiz': document.getElementById('blitz-quiz'),
    'blitz-result': document.getElementById('blitz-result'),
};

function showVsScreen(id) {
    Object.keys(screens).forEach(key => screens[key].classList.remove('active'));
    screens[id].classList.add('active');
}

export function initVersus() {
    console.log("⚔️ Versus Arena Initialized");
    
    const versusBtn = document.getElementById('versus-btn');
    if (versusBtn) versusBtn.addEventListener('click', async () => {
        // 🔥 PLACEMENT LOCK: Verify if player has established a rank first
        const myId = getPersistentId();
        const profile = await getUserProfileData(myId);
        
        if (!profile || !profile.hasPlacement) {
            alert("⚠️ PROVING GROUNDS REQUIRED: You must complete the Placement Quiz (Start Quiz) at least once to establish your initial Elo rank before you can enter the Versus Arena!");
            return;
        }

        document.getElementById('vs-choice-modal').classList.add('visible');
    });

    document.getElementById('close-vs-choice').addEventListener('click', () => {
        document.getElementById('vs-choice-modal').classList.remove('visible');
    });

    document.getElementById('close-vs-join').addEventListener('click', () => {
        document.getElementById('vs-join-modal').classList.remove('visible');
    });

    document.getElementById('vs-random-btn').addEventListener('click', startRandomMatchmaking);
    
    document.getElementById('vs-friend-btn').addEventListener('click', () => {
        document.getElementById('vs-choice-modal').classList.remove('visible');
        createPrivateRoom();
    });

    document.getElementById('vs-join-friend-btn').addEventListener('click', () => {
        document.getElementById('vs-choice-modal').classList.remove('visible');
        document.getElementById('vs-join-modal').classList.add('visible');
    });

    document.getElementById('vs-confirm-join').addEventListener('click', () => {
        const code = document.getElementById('vs-join-code').value.toUpperCase().trim();
        if (code.length === 6) joinRoom(code);
        else alert("Please enter a 6-digit code!");
    });

    document.getElementById('cancel-vs-btn').addEventListener('click', leaveRoom);
    document.getElementById('vs-back-btn').addEventListener('click', () => {
        leaveRoom();
    });
    document.getElementById('blitz-back-btn').addEventListener('click', () => {
        leaveRoom();
    });
    document.getElementById('vs-blitz-btn').addEventListener('click', () => {
        document.getElementById('vs-choice-modal').classList.remove('visible');
        startBlitzMatchmaking();
    });

    // 🛡️ ANTI-CHEAT: Tab-switch penalty during active match (both modes)
    document.addEventListener('visibilitychange', () => {
        const cheatToast = (msg) => {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const t = document.createElement('div');
            t.className = 'toast cheat-toast';
            t.textContent = msg;
            container.appendChild(t);
            setTimeout(() => t.remove(), 3200);
        };
        if (document.hidden && vsStatus === 'playing' && !isLocalAnswered) {
            console.warn('🚨 Anti-cheat: Tab switch detected! (VS mode)');
            const bar = document.getElementById('vs-count-bar');
            if (bar) bar.style.width = '0%';
            submitVsAnswer(false, null);
            (window.showToast || cheatToast)('⚠️ TAB SWITCH DETECTED! Question marked WRONG as penalty!');
        }
        if (document.hidden && blitzStatus === 'playing' && !blitzAnswered) {
            console.warn('🚨 Anti-cheat: Tab switch detected! (Blitz mode)');
            submitBlitzAnswer(false, null);
            (window.showToast || cheatToast)('⚠️ TAB SWITCH DETECTED! Question marked WRONG as penalty!');
        }
    });

    // 🤖 SOLO AI MODE SELECTION
    ['easy', 'medium', 'hard'].forEach(diff => {
        document.getElementById(`ai-${diff}-btn`).addEventListener('click', () => {
            aiDifficulty = diff;
            document.getElementById('vs-choice-modal').classList.remove('visible');
            startSoloAIMatch();
        });
    });
}

async function startRandomMatchmaking() {
    document.getElementById('vs-choice-modal').classList.remove('visible');
    myPlayerId = getPersistentId();
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = "Searching for an opponent...";
    document.getElementById('room-code-display').style.display = 'none';
    startMatchmakingTimer();

    // Reset avatars
    document.getElementById('p2-avatar').textContent = '❓';
    document.getElementById('p2-name').textContent = 'Waiting...';

    // 🔒 ATOMIC QUEUE MATCHMAKING (v1.1.9)
    // Eliminates race conditions by locking a central queue document, forcing simultaneous joiners to pair.
    try {
        const queueRef = doc(db, 'rooms', '--MATCHMAKING-QUEUE--');
        let finalRoomId = null;
        const newRoomId = Math.random().toString(36).substring(2, 10);

        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(queueRef);
            let queue = snap.exists() ? snap.data().queue || [] : [];
            
            // 🛡️ Flush ghosts (Increase to 60s to avoid the "20s" gap issue)
            const now = Date.now();
            queue = queue.filter(p => (now - p.time) < 60000);

            // Snag an opponent
            const opponentIdx = queue.findIndex(p => p.id !== myPlayerId);
            
            if (opponentIdx !== -1) {
                // Match Found!
                const opponent = queue.splice(opponentIdx, 1)[0];
                transaction.set(queueRef, { queue }); // Save queue with opponent removed
                finalRoomId = opponent.roomId;
            } else {
                // No opponent, jump into queue to wait
                // Prevent duplicate enqueue
                if (!queue.find(p => p.id === myPlayerId)) {
                    queue.push({ id: myPlayerId, roomId: newRoomId, time: now });
                    transaction.set(queueRef, { queue });
                }
                finalRoomId = 'WAIT:' + newRoomId;
            }
        });

        if (finalRoomId.startsWith('WAIT:')) {
            const parsedRoomId = finalRoomId.split(':')[1];
            createRoom('random', parsedRoomId);
            startMatchmakingHeartbeat(queueRef);
        } else {
            // We matched! Jump into their waiting room!
            await joinRoom(finalRoomId);
        }
    } catch (e) {
        console.error("Matchmaking Queue error:", e);
        stopMatchmakingTimer();
        alert("Arena Connection Error: Retrying connection...");
        showVsScreen('landing');
    }
}

async function createPrivateRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    createRoom('private', code);
}

async function createRoom(type, customId = null) {
    isHost = true;
    myPlayerId = getPersistentId();
    const roomId = customId || Math.random().toString(36).substring(2, 10);
    currentRoomId = roomId;

    const initialData = {
        players: {
            [myPlayerId]: {
                name: auth.currentUser?.displayName || "Gladiator",
                score: 0,
                status: 'waiting',
                avatar: '⚡'
            }
        },
        playerEmails: {
            [myPlayerId]: getPersistentId() // Store ID for Elo lookup later
        },
        playerCount: 1,
        matchStatus: type === 'private' ? 'private' : 'searching_random',
        status: 'lobby',
        currentQuestionIndex: -1,
        createdAt: serverTimestamp()
    };

    try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(roomRef, initialData);
        
        // 🔥 FIX: Actually show the lobby screen!
        showVsScreen('lobby');

        if (type === 'private') {
            document.getElementById('room-code-display').style.display = 'block';
            document.getElementById('share-code').textContent = roomId;
            document.getElementById('lobby-status').textContent = "Waiting for friend...";
        } else {
            document.getElementById('lobby-status').textContent = "Searching for opponent...";
        }

        listenToRoom(roomId);
    } catch (e) {
        console.error("Create Room Error:", e);
        alert("Failed to create room. Check Firebase Rules!");
        showVsScreen('landing');
    }
}

async function joinRoom(roomId) {
    isHost = false;
    myPlayerId = getPersistentId();
    currentRoomId = roomId;

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
        alert("Room not found!");
        showVsScreen('landing');
        return;
    }

    const data = snap.data();
    if (data.playerCount >= 2 && !data.players[myPlayerId]) {
        alert("Room is full!");
        showVsScreen('landing');
        return;
    }

    // Initialize Joiner Data
    await updateDoc(roomRef, 
        new FieldPath('players', myPlayerId), {
            name: auth.currentUser?.displayName || "Gladiator",
            score: 0,
            status: 'waiting',
            avatar: '⚡'
        },
        new FieldPath('playerEmails', myPlayerId), getPersistentId(),
        'playerCount', 2,
        'matchStatus', 'full' 
    );

    document.getElementById('vs-join-modal').classList.remove('visible');
    showVsScreen('lobby');
    listenToRoom(roomId);
}

function listenToRoom(roomId) {
    if (roomListener) roomListener();
    roomListener = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        latestRoomData = data; // 🔥 EXTREMELY CRITICAL: Update global ref for the watchdog!
        
        // 🚨 DISCONNECT CHECK: If opponent leaves or room is deleted
        if (vsStatus !== 'idle' && (!data.players[myPlayerId] || (data.playerCount < 2 && vsStatus === 'playing'))) {
            // Note: Don't alert if we're already leaving or finished
            if (vsStatus !== 'finished') alert("Opponent has disconnected or left the arena! 💨");
            leaveRoom();
            return;
        }

        // Lobby Sync
        if (data.status === 'lobby') {
            const playerIds = Object.keys(data.players);
            document.getElementById('p1-name').textContent = data.players[playerIds[0]].name;
            if (playerIds[1]) {
                document.getElementById('p2-name').textContent = data.players[playerIds[1]].name;
                document.getElementById('p2-avatar').textContent = '⚡';
                document.getElementById('lobby-status').textContent = "Match Found! Prepare for Battle...";
                if (isHost && data.playerCount === 2 && data.currentQuestionIndex === -1 && data.topicIndex === undefined) {
                    setTimeout(() => spinSlotMachine(), 1500);
                }
            }
        }
        
        // Slot Machine Sync
        if (data.status === 'lobby' && data.topicIndex !== undefined) {
            handleSlotMachineSync(data.topicIndex);
        }

        // Game Start
        if (data.status === 'playing' && vsStatus !== 'playing') {
            vsQuestions = data.questions;
            vsStatus = 'playing';
            vsScore = 0;
            vsCorrectCount = 0;
            vsOpponentScore = 0;
            isAdvancingRound = false; // Clear lock on start
            showVsScreen('quiz');
            
            if (antiHangInterval) clearInterval(antiHangInterval);
            antiHangInterval = setInterval(() => {
                if (vsStatus !== 'playing' || !latestRoomData) return;
                checkRoundOver(latestRoomData);
            }, 3000);
        }

        // AI Sync Override: If we are in Solo AI mode, don't wait for Room Data for scores
        if (isSoloAI && data.status === 'playing') {
            document.getElementById('vs-opp-score').textContent = vsOpponentScore;
        }

        // Live Question Sync
        if (data.status === 'playing') {
            if (data.questions && !vsQuestions.length) {
                vsQuestions = data.questions; 
            }

            if (data.currentQuestionIndex !== vsCurrentIndex || !document.getElementById('vs-options').children.length) {
                 vsCurrentIndex = data.currentQuestionIndex;
                 if (vsQuestions.length) renderVsQuestion();
            }
            // Update HUD
            const pIds = Object.keys(data.players);
            const myData = data.players[myPlayerId];
            const oppId = pIds.find(id => id !== myPlayerId);
            const oppData = oppId ? data.players[oppId] : null;

            if (myData) {
                document.getElementById('vs-my-name').textContent = "You";
                document.getElementById('vs-my-score').textContent = myData.score || 0;
                vsScore = myData.score || 0;
                // 🟢 Animate the status dot instead of emoji
                const myDot = document.getElementById('vs-my-dot');
                if (myDot) myDot.classList.toggle('dot-ready', myData.status === 'answered');
            }
            if (oppData) {
                document.getElementById('vs-opp-name').textContent = oppData.name;
                document.getElementById('vs-opp-score').textContent = oppData.score || 0;
                vsOpponentScore = oppData.score || 0;
                // 🟢 Opponent ready dot
                const oppDot = document.getElementById('vs-opp-dot');
                if (oppDot) oppDot.classList.toggle('dot-ready', oppData.status === 'answered');
            }

            // Sync transitions (Force skip if stuck)
            if (vsStatus === 'playing' && currentRoomId && myData) {
                checkRoundOver(data);
            }
        }

        // Result Sync
        if (data.status === 'finished' && vsStatus === 'playing') {
            finishVsGame(data);
        }
    }, (error) => {
        console.error("Listener Error:", error);
        if (vsStatus !== 'idle') leaveRoom();
    });

    // Cleanup on disconnect (Basic)
    window.addEventListener('beforeunload', leaveRoom);
}

async function spinSlotMachine() {
    const topicIdx = Math.floor(Math.random() * BATTLE_TOPICS.length);
    await updateDoc(doc(db, 'rooms', currentRoomId), { topicIndex: topicIdx });
    // ⚡ Pre-load questions IN PARALLEL while the slot animation plays (hides API latency!)
    prepareGame(BATTLE_TOPICS[topicIdx].id); // Do NOT await — fires alongside spin animation!
}

function handleSlotMachineSync(idx) {
    const slot = document.getElementById('vs-topic-slot');
    const strip = document.getElementById('slot-strip');
    if (slot.style.display === 'block') return; // Already spinning

    slot.style.display = 'block';
    
    // Create the strip items
    strip.innerHTML = '';
    // Add multiple sets for infinite look
    for(let i=0; i<5; i++) {
        BATTLE_TOPICS.forEach(t => {
            const el = document.createElement('div');
            el.className = 'slot-item';
            el.innerHTML = `${t.icon} ${t.name}`;
            strip.appendChild(el);
        });
    }

    // Spin Target: (LoopCount * TopicCount + idx) * ItemHeight
    const targetY = (15 + idx) * 60; 
    setTimeout(() => {
        strip.style.transform = `translateY(-${targetY}px)`;
    }, 100);

    setTimeout(() => {
        strip.classList.add('playing-slot');
        if (isHost) {
            // ⚡ Questions are already being fetched in parallel — poll until they arrive
            let checkInterval = setInterval(async () => {
                const snap = await getDoc(doc(db, 'rooms', currentRoomId));
                if (snap.exists() && snap.data().questions) {
                    clearInterval(checkInterval);
                    // Brief pause so users can see the final slot result
                    setTimeout(() => {
                        updateDoc(doc(db, 'rooms', currentRoomId), { status: 'playing' });
                    }, 500);
                }
            }, 500); // Poll every 0.5s instead of 1s for snappier launch
        }
    }, 3200); // Tight to the 3s CSS transition — no extra grace period needed
}

async function prepareGame(topicId) {
    if (!currentRoomId) return;
    try {
        const topic = BATTLE_TOPICS.find(t => t.id === topicId);
        let questions = [];

        if (topic.type === 'local') {
            const pool = ARENA_QUESTIONS[topicId] || [];
            questions = [...pool].sort(() => Math.random() - 0.5).slice(0, 10).map(q => ({ ...q, categoryId: topicId }));
        } else {
            const res = await fetch(`https://opentdb.com/api.php?amount=10&category=${topicId}&type=multiple`);
            const json = await res.json();
            questions = json.results.map(q => ({
                text: q.question,
                correct: q.correct_answer,
                options: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5),
                categoryId: topicId
            }));
        }

        await updateDoc(doc(db, 'rooms', currentRoomId), {
            questions: questions,
            currentQuestionIndex: 0,
            lastRoundStart: serverTimestamp() 
        });
    } catch (e) {
        console.error("Prep failed", e);
    }
}

function renderVsQuestion() {
    const q = vsQuestions[vsCurrentIndex];
    document.getElementById('vs-q-count').textContent = `Question ${vsCurrentIndex + 1}/10`;
    
    // 🔥 Localized Category Name from BATTLE_TOPICS
    const topic = BATTLE_TOPICS.find(t => t.id === q.categoryId) || { name: q.category || "Competition" };
    document.getElementById('vs-category').textContent = topic.name;
    document.getElementById('vs-q-text').innerHTML = q.text;
    
    const container = document.getElementById('vs-options');
    container.innerHTML = '';
    
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.dataset.rawopt = opt;
        
        // 👑 ADMIN CHEAT: Reveal correct answer (only for Creator)
        if (window._isAdmin && opt === q.correct) {
             btn.style.border = "2px solid #10b981";
             btn.style.boxShadow = "0 0 15px rgba(16, 185, 129, 0.4)";
        }

        btn.onclick = () => submitVsAnswer(opt === q.correct, opt);
        container.appendChild(btn);
    });

    // Reset ready dots at start of each new question
    const myDot = document.getElementById('vs-my-dot');
    const oppDot = document.getElementById('vs-opp-dot');
    if (myDot) myDot.classList.remove('dot-ready');
    if (oppDot) oppDot.classList.remove('dot-ready');

    startVsTimer();
    if (isSoloAI) aiThink();
}

function startVsTimer() {
    timeLeft = 8; // Reset to 8 seconds
    const bar = document.getElementById('vs-count-bar');
    const txt = document.getElementById('vs-timer-text');
    isLocalAnswered = false; // Reset local state
    
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    
    vsTimerInterval = setInterval(() => {
        timeLeft -= 0.1; // Decrement by 0.1 seconds
        const pct = (timeLeft / 8) * 100; // Calculate percentage based on 8 seconds
        bar.style.width = `${pct}%`;
        txt.textContent = `${Math.ceil(timeLeft)}s`; // Display rounded up seconds

        if (timeLeft <= 0) {
            clearInterval(vsTimerInterval);
            // 🛡️ Only submit "Wrong/Timeout" if they didn't already answer
            if (!isLocalAnswered) submitVsAnswer(false);
        }
    }, 100); // Update every 100ms
}

// ------------------------------------------------------------
// 🤖 SOLO AI ENGINE (v1.4.0)
// ------------------------------------------------------------
function startSoloAIMatch() {
    isSoloAI = true;
    vsStatus = 'matching';
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = "Synthesizing AI Adversary...";
    document.getElementById('p2-avatar').textContent = '🤖';
    document.getElementById('p2-name').textContent = `AI-${aiDifficulty.toUpperCase()}`;
    
    // Simulate slight delay for "synthesis"
    setTimeout(async () => {
        isHost = true; 
        vsStatus = 'playing';
        vsScore = 0;
        vsOpponentScore = 0;
        vsCurrentIndex = 0;
        
        const catIdx = Math.floor(Math.random() * BATTLE_TOPICS.length);
        const topicId = BATTLE_TOPICS[catIdx].id;
        
        document.getElementById('vs-category').textContent = BATTLE_TOPICS[catIdx].name;
        
        const pool = ARENA_QUESTIONS[topicId] || [];
        vsQuestions = [...pool].sort(() => Math.random() - 0.5).slice(0, 10).map(q => ({ ...q, categoryId: topicId }));
        
        showVsScreen('quiz');
        renderVsQuestion();
        document.getElementById('vs-opp-name').textContent = `AI-${aiDifficulty.toUpperCase()}`;
    }, 1500);
}

function aiThink() {
    if (!isSoloAI || vsStatus !== 'playing') return;
    if (aiTimer) clearTimeout(aiTimer);
    
    // Difficulty Settings
    const settings = {
        easy: { delay: [4000, 7000], accuracy: 0.35 },
        medium: { delay: [2500, 6000], accuracy: 0.65 },
        hard: { delay: [1500, 4500], accuracy: 0.92 }
    };
    
    const s = settings[aiDifficulty];
    const delay = s.delay[0] + Math.random() * (s.delay[1] - s.delay[0]);
    
    aiTimer = setTimeout(() => {
        if (vsStatus !== 'playing') return;
        const correct = Math.random() < s.accuracy;
        const timeLeftAI = timeLeft || 8;
        let bonus = correct ? Math.floor(timeLeftAI / 5) : 0;
        vsOpponentScore += correct ? (10 + bonus) : 0;
        
        // Update UI
        document.getElementById('vs-opp-score').textContent = vsOpponentScore;
        const oppDot = document.getElementById('vs-opp-dot');
        if (oppDot) oppDot.classList.add('dot-ready');
        
        // Check if both ready in AI mode
        if (isLocalAnswered) {
             checkSoloRoundOver();
        }
    }, delay);
}

function checkSoloRoundOver() {
    if (!isSoloAI || isAdvancingRound) return;
    isAdvancingRound = true;
    
    setTimeout(() => {
        vsCurrentIndex++;
        if (vsCurrentIndex < 10) {
            renderVsQuestion();
            isAdvancingRound = false;
        } else {
            finishVsGame({ players: { ai: { score: vsOpponentScore } } });
            isAdvancingRound = false;
        }
    }, 1500);
}

async function submitVsAnswer(isCorrect, selectedOpt = null) {
    if ((!currentRoomId && !isSoloAI) || isLocalAnswered) return;
    isLocalAnswered = true; // Lock-out further submits for this round
    
    if (isCorrect) vsCorrectCount++;
    let bonus = isCorrect ? Math.floor(timeLeft / 5) : 0; 
    vsScore += isCorrect ? (10 + bonus) : 0;

    const options = document.querySelectorAll('#vs-options .option-btn');
    options.forEach(b => {
        b.disabled = true;
        const q = vsQuestions[vsCurrentIndex];
        if (b.dataset.rawopt === q.correct) {
            b.style.borderColor = 'var(--success)';
            b.classList.add('ans-correct');
        }
        else if (b.disabled && b.dataset.rawopt === selectedOpt) {
            b.style.opacity = '0.7';
            b.classList.add('ans-wrong');
        }
    });

    if (isSoloAI) {
        document.getElementById('vs-my-score').textContent = vsScore;
        const myDot = document.getElementById('vs-my-dot');
        if (myDot) myDot.classList.add('dot-ready');
        
        // Advance if AI already answered
        const oppDot = document.getElementById('vs-opp-dot');
        if (oppDot && oppDot.classList.contains('dot-ready')) {
            checkSoloRoundOver();
        }
        return;
    }

    try {
        const roomRef = doc(db, 'rooms', currentRoomId);
        document.getElementById('vs-my-score').textContent = vsScore;
        await updateDoc(
            roomRef, 
            new FieldPath('players', myPlayerId, 'score'), vsScore,
            new FieldPath('players', myPlayerId, 'status'), 'answered'
        );
    } catch(e) { }
}

function checkRoundOver(data) {
    if (!currentRoomId || isAdvancingRound) return;
    
    const pIds = Object.keys(data.players || {});
    if (pIds.length === 0) return;

    const allAnswered = pIds.every(id => data.players[id].status === 'answered');

    let timedOut = false;
    if (data.lastRoundStart) {
        const startTime = data.lastRoundStart.toMillis ? data.lastRoundStart.toMillis() : Date.now();
        const elapsed = Date.now() - startTime;
        if (elapsed > 10000) timedOut = true;
    }

    // 🔥 INSTANT ADVANCEMENT: If both answered, skip the 10-second wait!
    if ((allAnswered || timedOut) && currentRoomId) {
        isAdvancingRound = true; // Lock immediately to prevent parallel execution
        const nextIdx = data.currentQuestionIndex + 1;
        
        // Host advances the game normally, or Client forces it if Host is delayed
        // Give a smooth 1.5s visual pause if advancing early, or skip immediately if timed out.
        const baseDelay = allAnswered && !timedOut ? 1500 : 0;
        const clientGracePeriod = isHost ? baseDelay : baseDelay + 2000;

        setTimeout(async () => {
            if (!currentRoomId) {
                isAdvancingRound = false;
                return;
            }
            try {
                const roomRef = doc(db, 'rooms', currentRoomId);
                const freshSnap = await getDoc(roomRef);
                if (!freshSnap.exists()) {
                    isAdvancingRound = false;
                    return;
                }
                
                const freshData = freshSnap.data();
                // Check if someone else already advanced it
                if (freshData.currentQuestionIndex >= nextIdx || freshData.status === 'finished') {
                    isAdvancingRound = false;
                    return;
                }

                if (nextIdx < 10) {
                    // 🛡️ SCORE PRESERVATION: Clone the entire players object and reset statuses natively
                    // This bypasses Firebase's dot notation shredding entirely!
                    const newPlayers = { ...freshData.players };
                    Object.keys(newPlayers).forEach(id => {
                        newPlayers[id].status = 'waiting';
                    });

                    await updateDoc(roomRef, {
                        currentQuestionIndex: nextIdx,
                        lastRoundStart: serverTimestamp(),
                        players: newPlayers
                    });
                } else {
                    await updateDoc(roomRef, { status: 'finished' });
                }
            } catch(e) { 
                console.error("Round transition error:", e); 
            } finally {
                isAdvancingRound = false; // Release lock
            }
        }, clientGracePeriod);
    }
}

function finishVsGame(data) {
    vsStatus = 'finished';
    if (antiHangInterval) clearInterval(antiHangInterval);
    const myScore = vsScore;
    const oppScore = vsOpponentScore;

    document.getElementById('vs-final-my-score').textContent = myScore;
    document.getElementById('vs-final-opp-score').textContent = oppScore;
    showVsScreen('result');

    const myEmail = auth.currentUser?.email;
    const pIds = Object.keys(data.players || {});
    const oppId = pIds.find(id => id !== myPlayerId);

    // 🔥 Update ELO (Safe because finishVsGame is only called exactly once per transition)
    if (isSoloAI) {
        processSoloEloUpdate(myScore, oppScore, vsCorrectCount);
    } else {
        processEloUpdate(myScore, oppScore, vsCorrectCount);
    }

    const title = document.getElementById('vs-result-title');
    const msg = document.getElementById('vs-result-msg');
    const icon = document.getElementById('vs-status-icon');

    if (myScore > oppScore) {
        title.textContent = "VICTORY! 👑";
        title.className = "gradient-text winner-glow";
        msg.textContent = "You truly are an academic weapon.";
        icon.textContent = "🏆";
    } else if (myScore < oppScore) {
        title.textContent = "DEFEAT... 💀";
        msg.textContent = "The arena shows no mercy.";
        icon.textContent = "🥀";
    } else {
        title.textContent = "DRAW! 🤝";
        msg.textContent = "It seems you found your match.";
        icon.textContent = "⚖️";
    }
}


async function processEloUpdate(myScore, oppScore, correctCount) {
    try {
        const { updateEloAfterMatch } = await import('./firebase.js');
        const won = myScore > oppScore;
        const draw = myScore === oppScore;
        
        const result = await updateEloAfterMatch(getPersistentId(), won, draw, correctCount);
        
        if (result) {
            const resultsScreen = document.getElementById('versus-result');
            
            // clear old elo div if any
            const existing = document.getElementById('elo-update-msg');
            if (existing) existing.remove();
            
            const eloDiv = document.createElement('div');
            eloDiv.id = 'elo-update-msg';
            eloDiv.style.marginTop = '20px';
            eloDiv.style.fontSize = '1.4rem';
            eloDiv.style.fontWeight = '900';
            eloDiv.style.color = result.change >= 0 ? '#10b981' : '#ef4444';
            eloDiv.innerHTML = `Elo Change: ${result.change >= 0 ? '+' : ''}${result.change} 🚀<br><small style="color:white; font-size:0.8rem">New Elo: ${result.newElo}</small>`;
            
            const scoresDiv = resultsScreen.querySelector('.vs-final-scores');
            if (scoresDiv) {
                scoresDiv.parentNode.insertBefore(eloDiv, scoresDiv.nextSibling);
            } else {
                resultsScreen.querySelector('.glass-panel').appendChild(eloDiv);
            }
        }
    } catch(e) { console.error("Elo display error", e); }
}

async function processSoloEloUpdate(myScore, oppScore, correctCount) {
    try {
        const { updateEloAfterMatch } = await import('./firebase.js');
        const won = myScore > oppScore;
        const draw = myScore === oppScore;
        
        // Lower stakes for AI battle: Win +3 to +5, Draw 0, Loss -1
        const result = await updateEloAfterMatch(getPersistentId(), won, draw, correctCount, true);
        
        if (result) {
            const resultsScreen = document.getElementById('versus-result');
            const existing = document.getElementById('elo-update-msg');
            if (existing) existing.remove();
            
            const eloDiv = document.createElement('div');
            eloDiv.id = 'elo-update-msg';
            eloDiv.style.marginTop = '20px';
            eloDiv.style.fontSize = '1.2rem';
            eloDiv.style.fontWeight = '800';
            eloDiv.style.color = '#818cf8';
            eloDiv.innerHTML = `Solo Practice: ${result.change >= 0 ? '+' : ''}${result.change} Elo 🤖<br><small style="color:white; font-size:0.8rem">New Elo: ${result.newElo}</small>`;
            
            const scoresDiv = resultsScreen.querySelector('.vs-final-scores');
            if (scoresDiv) scoresDiv.parentNode.insertBefore(eloDiv, scoresDiv.nextSibling);
            else resultsScreen.querySelector('.glass-panel').appendChild(eloDiv);
        }
    } catch(e) { console.error("Solo Elo error", e); }
}

async function leaveRoom() {
    if (roomListener) roomListener();
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    if (antiHangInterval) clearInterval(antiHangInterval);
    if (mmTimerInterval) stopMatchmakingTimer();
    if (mmHeartbeatInterval) clearInterval(mmHeartbeatInterval);
    if (aiTimer) clearTimeout(aiTimer);
    
    if (currentRoomId) {
        try {
            const roomRef = doc(db, 'rooms', currentRoomId);
            const snap = await getDoc(roomRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.playerCount > 1) {
                    // Just remove self if someone else is still there
                    await updateDoc(roomRef, {
                        [`players.${myPlayerId}`]: deleteField(),
                        playerCount: 1,
                        status: 'lobby',
                        matchStatus: 'searching_random' // allow others to join back
                    });
                } else {
                    // Delete entirely if last one out
                    await deleteDoc(roomRef);
                }
            }
        } catch(e) { console.error("Exit failed", e); }
    }
    
    // Deep DOM Cleanup (Wipes slot machine & player placeholders)
    document.getElementById('vs-topic-slot').style.display = 'none';
    const strip = document.getElementById('slot-strip');
    if (strip) {
        strip.classList.remove('playing-slot');
        strip.style.transform = 'translateY(0px)';
    }
    document.getElementById('p2-avatar').textContent = '❓';
    document.getElementById('p2-name').textContent = 'Waiting...';
    document.getElementById('lobby-status').textContent = "Searching for opponent...";
    document.getElementById('vs-options').innerHTML = '';
    
    vsStatus = 'idle';
    currentRoomId = null;
    isSoloAI = false;
    showVsScreen('landing');
}

// 🕓 MATCHMAKING TIMERS (v1.4.0)
function startMatchmakingTimer() {
    mmSearchSecs = 0;
    const timerEl = document.getElementById('lobby-timer');
    const secsEl = document.getElementById('mm-secs');
    if (timerEl) timerEl.style.display = 'block';
    
    if (mmTimerInterval) clearInterval(mmTimerInterval);
    mmTimerInterval = setInterval(() => {
        mmSearchSecs++;
        if (secsEl) secsEl.textContent = mmSearchSecs;
    }, 1000);
}

function stopMatchmakingTimer() {
    clearInterval(mmTimerInterval);
    const timerEl = document.getElementById('lobby-timer');
    if (timerEl) timerEl.style.display = 'none';
}

function startMatchmakingHeartbeat(queueRef) {
    if (mmHeartbeatInterval) clearInterval(mmHeartbeatInterval);
    mmHeartbeatInterval = setInterval(async () => {
        if (vsStatus !== 'matching' && vsStatus !== 'lobby') {
            clearInterval(mmHeartbeatInterval);
            return;
        }
        try {
            await runTransaction(db, async (t) => {
                const snap = await t.get(queueRef);
                if (!snap.exists()) return;
                let q = snap.data().queue || [];
                const idx = q.findIndex(p => p.id === myPlayerId);
                if (idx !== -1) {
                    q[idx].time = Date.now(); // Refresh timestamp
                    t.update(queueRef, { queue: q });
                }
            });
        } catch(e) { console.warn("Lobby heartbeat sync pulse skipped."); }
    }, 7000); // Pulse every 7s
}

// ============================================================
// ⚡ BLITZ DUEL ENGINE
// ============================================================
let blitzStatus = 'idle'; // idle | playing | finished
let blitzQuestions = [];
let blitzCurrentIndex = 0;
let blitzScore = 0;
let blitzOppScore = 0;
let blitzAnswered = false;
let blitzGlobalInterval = null; // 60s shared countdown
let blitzTimeLeft = 60;
let blitzListener = null;

async function startBlitzMatchmaking() {
    myPlayerId = getPersistentId();
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = '⚡ Searching for Blitz opponent...';
    document.getElementById('room-code-display').style.display = 'none';
    document.getElementById('p2-avatar').textContent = '❓';
    document.getElementById('p2-name').textContent = 'Waiting...';

    try {
        const queueRef = doc(db, 'rooms', '--BLITZ-QUEUE--');
        let finalRoomId = null;
        const newRoomId = 'blitz_' + Math.random().toString(36).substring(2, 10);

        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(queueRef);
            let queue = snap.exists() ? snap.data().queue || [] : [];
            const now = Date.now();
            queue = queue.filter(p => (now - p.time) < 15000);
            const opponentIdx = queue.findIndex(p => p.id !== myPlayerId);
            if (opponentIdx !== -1) {
                const opponent = queue.splice(opponentIdx, 1)[0];
                transaction.set(queueRef, { queue });
                finalRoomId = opponent.roomId;
            } else {
                if (!queue.find(p => p.id === myPlayerId)) {
                    queue.push({ id: myPlayerId, roomId: newRoomId, time: now });
                    transaction.set(queueRef, { queue });
                }
                finalRoomId = 'WAIT:' + newRoomId;
            }
        });

        if (finalRoomId.startsWith('WAIT:')) {
            startMatchmakingTimer();
            createBlitzRoom(finalRoomId.split(':')[1]);
            const queueRef = doc(db, 'rooms', '--BLITZ-QUEUE--');
            startMatchmakingHeartbeat(queueRef);
        } else {
            await joinBlitzRoom(finalRoomId);
        }
    } catch (e) {
        console.error('Blitz matchmaking error:', e);
        stopMatchmakingTimer();
        alert('Blitz Arena Connection Error. Please try again!');
        showVsScreen('landing');
    }
}

async function createBlitzRoom(roomId) {
    isHost = true;
    currentRoomId = roomId;
    const initialData = {
        mode: 'blitz',
        players: {
            [myPlayerId]: { name: auth.currentUser?.displayName || 'Gladiator', score: 0, status: 'waiting', avatar: '⚡' }
        },
        playerEmails: { [myPlayerId]: myPlayerId },
        playerCount: 1,
        matchStatus: 'searching_blitz',
        status: 'lobby',
        currentQuestionIndex: -1,
        createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'rooms', roomId), initialData);
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = '⚡ Waiting for Blitz opponent...';
    document.getElementById('room-code-display').style.display = 'none';
    listenToBlitzRoom(roomId);
}

async function joinBlitzRoom(roomId) {
    isHost = false;
    currentRoomId = roomId;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(
        roomRef,
        new FieldPath('players', myPlayerId), { name: auth.currentUser?.displayName || 'Gladiator', score: 0, status: 'waiting', avatar: '⚡' },
        new FieldPath('playerEmails', myPlayerId), myPlayerId,
        'playerCount', 2,
        'matchStatus', 'full'
    );
    showVsScreen('lobby');
    listenToBlitzRoom(roomId);
}

function listenToBlitzRoom(roomId) {
    if (blitzListener) blitzListener();
    blitzListener = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        // Lobby sync (reuse existing lobby DOM)
        if (data.status === 'lobby') {
            const pIds = Object.keys(data.players);
            document.getElementById('p1-name').textContent = data.players[pIds[0]].name;
            if (pIds[1]) {
                document.getElementById('p2-name').textContent = data.players[pIds[1]].name;
                document.getElementById('p2-avatar').textContent = '⚡';
                document.getElementById('lobby-status').textContent = '⚡ Blitz Match Found! Prepare...';
                // Host pre-loads questions NOW, while showing lobby
                if (isHost && data.playerCount === 2 && data.currentQuestionIndex === -1 && !data.questions) {
                    prepareBlitzGame();
                }
            }
        }

        // Game start
        if (data.status === 'blitz_playing' && blitzStatus !== 'playing') {
            blitzQuestions = data.questions;
            blitzStatus = 'playing';
            blitzScore = 0;
            vsScore = 0; // Use shared vsScore for HUD sync
            vsOpponentScore = 0;
            blitzCurrentIndex = 0;
            blitzTimeLeft = 60;
            showVsScreen('blitz-quiz');
            startBlitzGlobalClock();
            renderBlitzQuestion();
        }

        // Live score sync
        if (data.status === 'blitz_playing') {
            const pIds = Object.keys(data.players);
            const myData = data.players[myPlayerId];
            const oppId = pIds.find(id => id !== myPlayerId);
            const oppData = oppId ? data.players[oppId] : null;
            if (myData) {
                document.getElementById('blitz-my-score').textContent = myData.score || 0;
                blitzScore = myData.score || 0;
                const d = document.getElementById('blitz-my-dot');
                if (d) d.classList.toggle('dot-ready', myData.status === 'answered');
            }
            if (oppData) {
                document.getElementById('blitz-opp-name').textContent = oppData.name;
                document.getElementById('blitz-opp-score').textContent = oppData.score || 0;
                blitzOppScore = oppData.score || 0;
                const d = document.getElementById('blitz-opp-dot');
                if (d) d.classList.toggle('dot-ready', oppData.status === 'answered');
            }
        }

        // Finish
        if (data.status === 'blitz_finished' && blitzStatus === 'playing') {
            finishBlitzGame(data);
        }
    });
    window.addEventListener('beforeunload', leaveRoom);
}

async function prepareBlitzGame() {
    if (!currentRoomId) return;
    try {
        // 🔥 BLITZ MIX: Pick 2 local categories and 3 API categories
        const localKeys = ["ph_history", "geography_ph"];
        const apiIds = [9, 17, 18, 19];
        
        let mixedPool = [];
        
        // 1. Local Pool
        localKeys.forEach(key => {
            const items = ARENA_QUESTIONS[key].slice(0, 5).map(q => ({ ...q, categoryId: key }));
            mixedPool.push(...items);
        });

        // 2. Fetch from API (General)
        const res = await fetch(`https://opentdb.com/api.php?amount=15&category=9&type=multiple`);
        const json = await res.json();
        const apiItems = json.results.map(q => ({
            text: q.question,
            correct: q.correct_answer,
            options: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5),
            categoryId: 9
        }));
        mixedPool.push(...apiItems);

        // Shuffle the whole thing for endless variety
        const shuffled = [...mixedPool].sort(() => Math.random() - 0.5);
        
        await updateDoc(doc(db, 'rooms', currentRoomId), {
            questions: shuffled,
            currentQuestionIndex: 0,
            status: 'blitz_playing',
            blitzStartedAt: serverTimestamp()
        });
    } catch (e) {
        console.error('Blitz prep failed', e);
    }
}

function startBlitzGlobalClock() {
    blitzTimeLeft = 60;
    if (blitzGlobalInterval) clearInterval(blitzGlobalInterval);
    blitzGlobalInterval = setInterval(() => {
        blitzTimeLeft--;
        const el = document.getElementById('blitz-clock');
        if (el) {
            el.textContent = blitzTimeLeft;
            if (blitzTimeLeft <= 10) el.classList.add('danger');
        }
        if (blitzTimeLeft <= 0) {
            clearInterval(blitzGlobalInterval);
            if (isHost) updateDoc(doc(db, 'rooms', currentRoomId), { status: 'blitz_finished' });
        }
    }, 1000);
}

function renderBlitzQuestion() {
    if (!blitzQuestions.length) return;
    const q = blitzQuestions[blitzCurrentIndex];
    if (!q) {
        // If we reach the end of the pool, just loop back to beginning (rare with 25+ questions)
        blitzCurrentIndex = 0;
        renderBlitzQuestion();
        return;
    }
    // Endless mode — remove the "/ 10" cap
    document.getElementById('blitz-q-count').textContent = `SPEED RACE! (Score: ${vsScore})`;
    
    // 🔥 Localized Category Name for Blitz
    const topic = BATTLE_TOPICS.find(t => t.id === q.categoryId) || { name: q.category || "Blitz" };
    document.getElementById('blitz-category').textContent = topic.name;
    document.getElementById('blitz-q-text').innerHTML = q.text;

    const container = document.getElementById('blitz-options');
    container.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.dataset.rawopt = opt;
        btn.onclick = () => submitBlitzAnswer(opt === q.correct, opt);
        container.appendChild(btn);
    });

    // Reset answered guard
    blitzAnswered = false;
    const bar = document.getElementById('blitz-q-bar');
    if (bar) bar.style.display = 'none'; // Hide per-question bar
}

async function submitBlitzAnswer(isCorrect, selectedOpt) {
    if (!currentRoomId || blitzAnswered) return;
    blitzAnswered = true;

    // Visual feedback
    const options = document.querySelectorAll('#blitz-options .option-btn');
    const q = blitzQuestions[blitzCurrentIndex];
    options.forEach(b => {
        b.disabled = true;
        if (b.dataset.rawopt === q.correct) b.classList.add('ans-correct');
        else if (b.dataset.rawopt === selectedOpt) b.classList.add('ans-wrong');
    });

    // +15 correct, -5 wrong (floor at 0)
    if (isCorrect) vsScore += 15;
    else vsScore = Math.max(0, vsScore - 5);
    document.getElementById('blitz-my-score').textContent = vsScore;

    // Instant local advancement after 0.6s to see the feedback
    setTimeout(() => {
        if (blitzStatus !== 'playing') return;
        blitzCurrentIndex++;
        renderBlitzQuestion();
    }, 600);

    try {
        await updateDoc(doc(db, 'rooms', currentRoomId),
            new FieldPath('players', myPlayerId, 'score'), vsScore
        );
    } catch(e) { }
}

function advanceBlitzQuestion() {
    if (blitzStatus !== 'playing') return;
    clearInterval(blitzQInterval);
    blitzCurrentIndex++;
    if (blitzCurrentIndex < blitzQuestions.length && blitzTimeLeft > 0) {
        // Reset player statuses atomically (clone to avoid dot-notation shredding)
        if (isHost) {
            getDoc(doc(db, 'rooms', currentRoomId)).then(snap => {
                if (!snap.exists()) return;
                const newPlayers = { ...snap.data().players };
                Object.keys(newPlayers).forEach(id => { newPlayers[id].status = 'waiting'; });
                updateDoc(doc(db, 'rooms', currentRoomId), { currentQuestionIndex: blitzCurrentIndex, players: newPlayers });
            });
        }
        renderBlitzQuestion();
    } else if (blitzTimeLeft <= 0 || blitzCurrentIndex >= blitzQuestions.length) {
        if (isHost) updateDoc(doc(db, 'rooms', currentRoomId), { status: 'blitz_finished' });
    }
}

function finishBlitzGame(data) {
    blitzStatus = 'finished';
    clearInterval(blitzGlobalInterval);
    clearInterval(blitzQInterval);

    document.getElementById('blitz-final-my-score').textContent = blitzScore;
    document.getElementById('blitz-final-opp-score').textContent = blitzOppScore;
    showVsScreen('blitz-result');

    const title = document.getElementById('blitz-result-title');
    const msg = document.getElementById('blitz-result-msg');
    const icon = document.getElementById('blitz-status-icon');

    if (blitzScore > blitzOppScore) {
        title.textContent = 'SPEED KING! ⚡';
        title.className = 'gradient-text winner-glow';
        msg.textContent = 'You dominated the blitz!';
        icon.textContent = '👑';
    } else if (blitzScore < blitzOppScore) {
        title.textContent = 'DEFEATED';
        title.className = '';
        title.style.color = '#ef4444';
        msg.textContent = 'Train harder and run the blitz again!';
        icon.textContent = '💀';
    } else {
        title.textContent = 'DEAD HEAT!';
        title.className = 'gradient-text';
        msg.textContent = 'Perfectly matched!';
        icon.textContent = '⚡';
    }

    // 1.5x ELO stake for Blitz (higher risk/reward)
    processEloUpdate(blitzScore, blitzOppScore, Math.round(blitzScore / 15));
}

