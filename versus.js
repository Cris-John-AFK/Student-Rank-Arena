import { questions } from './questions.js';
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
let timeLeft = 10; // In seconds
let antiHangInterval = null;
let vsCorrectCount = 0;
let isAdvancingRound = false; // Safety lock to prevent double-skipping/freezing
let latestRoomData = null; // Global reference for the watchdog to avoid stale closure hanging

const BATTLE_TOPICS = [
    { id: 9, name: "General Knowledge", icon: "🌍" },
    { id: 18, name: "Computer Science", icon: "💻" },
    { id: 19, name: "Mathematics", icon: "➕" },
    { id: 22, name: "Geography", icon: "🗺️" },
    { id: 23, name: "History", icon: "📜" }
];

// DOM Helper
const screens = {
    landing: document.getElementById('landing'),
    lobby: document.getElementById('versus-lobby'),
    quiz: document.getElementById('versus-quiz'),
    result: document.getElementById('versus-result'),
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
}

async function startRandomMatchmaking() {
    document.getElementById('vs-choice-modal').classList.remove('visible');
    myPlayerId = getPersistentId();
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = "Searching for an opponent...";
    document.getElementById('room-code-display').style.display = 'none';

    // Reset avatars
    document.getElementById('p2-avatar').textContent = '❓';
    document.getElementById('p2-name').textContent = 'Waiting...';

    // 🔒 Atomic matchmaking using a Firestore Transaction
    // This prevents the race condition where two users press Random at the same time
    try {
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('matchStatus', '==', 'searching_random'), limit(5));
        const snapshot = await getDocs(q);

        let joined = false;
        // Try to atomically claim a room
        for (const roomDoc of snapshot.docs) {
            try {
                await runTransaction(db, async (transaction) => {
                    const freshSnap = await transaction.get(roomDoc.ref);
                    if (!freshSnap.exists()) throw new Error("Room gone");
                    const data = freshSnap.data();
                    // Only join if still genuinely open (race-proof check)
                    if (data.matchStatus !== 'searching_random' || data.playerCount !== 1) {
                        throw new Error("Room already taken");
                    }
                    const joinerId = getPersistentId();
                    transaction.update(roomDoc.ref, {
                        [`players.${joinerId}`]: {
                            name: auth.currentUser?.displayName || "Gladiator",
                            score: 0,
                            status: 'waiting',
                            avatar: '⚡'
                        },
                        [`playerEmails.${joinerId}`]: joinerId,
                        playerCount: 2,
                        matchStatus: 'full'
                    });
                });
                // Transaction succeeded — we're in!
                joined = true;
                isHost = false;
                currentRoomId = roomDoc.id;
                listenToRoom(roomDoc.id);
                break;
            } catch (txErr) {
                // This room was claimed by someone else at the same instant; try next
                continue;
            }
        }

        if (!joined) {
            // No open rooms found — we become the host
            createRoom('random');
        }
    } catch (e) {
        console.error("Matchmaking error:", e);
        alert("Arena Error: Make sure your Firestore Rules allow 'rooms' collection access!");
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
    await updateDoc(roomRef, {
        [`players.${myPlayerId}`]: {
            name: auth.currentUser?.displayName || "Gladiator",
            score: 0,
            status: 'waiting',
            avatar: '⚡'
        },
        [`playerEmails.${myPlayerId}`]: getPersistentId(),
        playerCount: 2,
        matchStatus: 'full' 
    });

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
            }
            if (oppData) {
                document.getElementById('vs-opp-name').textContent = oppData.name;
                document.getElementById('vs-opp-score').textContent = oppData.score || 0;
                vsOpponentScore = oppData.score || 0;
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
    // Host prepares questions and WAITS for completion
    await prepareGame(BATTLE_TOPICS[topicIdx].id);
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
            // Check if questions arrived before starting
            let checkInterval = setInterval(async () => {
                const snap = await getDoc(doc(db, 'rooms', currentRoomId));
                if (snap.exists() && snap.data().questions) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                        updateDoc(doc(db, 'rooms', currentRoomId), { status: 'playing' });
                    }, 500);
                }
            }, 1000);
        }
    }, 4500); // 3s spin + grace period
}

async function prepareGame(categoryId) {
    if (!currentRoomId) return;
    try {
        console.log("🛠️ Preparing 10 questions for category:", categoryId);
        
        // 🔥 FIX: 429 Rate Limit (Open Trivia DB only allows 1 request per 5 seconds)
        // We now make ONE single call for 10 questions instead of 3 parallel ones.
        const res = await fetch(`https://opentdb.com/api.php?amount=10&category=${categoryId}&type=multiple`);
        const json = await res.json();
        
        if (json.response_code !== 0) {
            throw new Error(`API returned code ${json.response_code}`);
        }

        const questions = json.results.map(q => ({
            category: q.category,
            text: q.question,
            correct: q.correct_answer,
            options: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5)
        }));

        await updateDoc(doc(db, 'rooms', currentRoomId), {
            questions: questions,
            currentQuestionIndex: 0,
            lastRoundStart: serverTimestamp() // Set first round start
        });
    } catch (e) {
        console.error("Prep failed", e);
        // Force minimum 5s to clear the OpenTDB rate limiter completely
        setTimeout(() => prepareGame(categoryId), 5500);
    }
}

function renderVsQuestion() {
    const q = vsQuestions[vsCurrentIndex];
    document.getElementById('vs-q-count').textContent = `Question ${vsCurrentIndex + 1}/10`;
    document.getElementById('vs-category').textContent = q.category;
    document.getElementById('vs-q-text').innerHTML = q.text;
    
    const container = document.getElementById('vs-options');
    container.innerHTML = '';
    
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.dataset.rawopt = opt;
        btn.onclick = () => submitVsAnswer(opt === q.correct, opt);
        container.appendChild(btn);
    });

    startVsTimer();
}

function startVsTimer() {
    timeLeft = 10; // Reset to 10 seconds
    const bar = document.getElementById('vs-count-bar');
    const txt = document.getElementById('vs-timer-text');
    
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    
    vsTimerInterval = setInterval(() => {
        timeLeft -= 0.1; // Decrement by 0.1 seconds
        const pct = (timeLeft / 10) * 100; // Calculate percentage based on 10 seconds
        bar.style.width = `${pct}%`;
        txt.textContent = `${Math.ceil(timeLeft)}s`; // Display rounded up seconds

        if (timeLeft <= 0) {
            clearInterval(vsTimerInterval);
            submitVsAnswer(false);
        }
    }, 100); // Update every 100ms
}

async function submitVsAnswer(isCorrect, selectedOpt = null) {
    if (!currentRoomId) return;
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    
    if (isCorrect) vsCorrectCount++;
    let bonus = isCorrect ? Math.floor(timeLeft / 5) : 0; // max +10 bonus
    vsScore += isCorrect ? (10 + bonus) : 0;

    const options = document.querySelectorAll('#vs-options .option-btn');
    options.forEach(b => {
        b.disabled = true;
        // Visual feedback - bypasses encoded HTML entities safely
        const q = vsQuestions[vsCurrentIndex];
        if (b.dataset.rawopt === q.correct) b.style.borderColor = 'var(--success)';
        else if (b.disabled && b.dataset.rawopt === selectedOpt) b.style.opacity = '0.5';
    });

    try {
        const roomRef = doc(db, 'rooms', currentRoomId);
        // Set local score too for instant UI feedback
        document.getElementById('vs-my-score').textContent = vsScore;
        
        // Use FieldPath to SAFELY update without breaking dot notation if email contains '.'
        await updateDoc(
            roomRef, 
            new FieldPath('players', myPlayerId, 'score'), vsScore,
            new FieldPath('players', myPlayerId, 'status'), 'answered'
        );
    } catch(e) {
        console.log("Submit ignored: Room likely already closed.");
    }
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
        if (elapsed > 12500) timedOut = true;
    }

    if (allAnswered || (timedOut && currentRoomId)) {
        isAdvancingRound = true; // Lock immediately to prevent parallel execution
        const nextIdx = data.currentQuestionIndex + 1;
        
        // Host advances the game normally, or Client forces it if Host is delayed
        // Force client to wait a tiny bit longer than host to give host priority
        const clientGracePeriod = isHost ? 1000 : 2500;

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
                    // Update current question index and reset player statuses ATOMICALLY
                    // We use the players object from fresh data but ONLY reset status
                    const pUpdate = {};
                    pIds.forEach(id => {
                        pUpdate[`players.${id}.status`] = 'waiting';
                    });

                    await updateDoc(roomRef, {
                        currentQuestionIndex: nextIdx,
                        lastRoundStart: serverTimestamp(),
                        ...pUpdate
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
    processEloUpdate(myScore, oppScore, vsCorrectCount);

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

async function leaveRoom() {
    if (roomListener) roomListener();
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    if (antiHangInterval) clearInterval(antiHangInterval);
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
    showVsScreen('landing');
}
