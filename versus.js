import { db, auth } from './firebase.js';
import { collection, doc, setDoc, updateDoc, onSnapshot, getDoc, query, where, getDocs, serverTimestamp, deleteDoc } from "firebase/firestore";

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
    if (versusBtn) versusBtn.addEventListener('click', () => {
        if (!auth.currentUser) {
            // Need a reference to main.js's showModal or just use alert
            alert("Please login or enter a name to step into the Arena!");
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

    document.getElementById('vs-confirm-join').addEventListener('click', () => {
        const code = document.getElementById('vs-join-code').value.toUpperCase().trim();
        if (code.length === 6) joinRoom(code);
        else alert("Please enter a 6-digit code!");
    });

    document.getElementById('cancel-vs-btn').addEventListener('click', leaveRoom);
    document.getElementById('vs-back-btn').addEventListener('click', () => {
        vsStatus = 'idle';
        showVsScreen('landing');
    });
}

async function startRandomMatchmaking() {
    document.getElementById('vs-choice-modal').classList.remove('visible');
    myPlayerId = auth.currentUser.uid;
    showVsScreen('lobby');
    document.getElementById('lobby-status').textContent = "Searching for an opponent...";
    document.getElementById('room-code-display').style.display = 'none';

    // Reset avatars
    document.getElementById('p2-avatar').textContent = '❓';
    document.getElementById('p2-name').textContent = 'Waiting...';

    // Look for existing 'random' room with 1 player
    try {
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('type', '==', 'random'), where('status', '==', 'lobby'), where('playerCount', '==', 1));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            joinRoom(snapshot.docs[0].id);
        } else {
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
    myPlayerId = auth.currentUser.uid;
    const roomId = customId || Math.random().toString(36).substring(2, 10);
    currentRoomId = roomId;

    const initialData = {
        type: type,
        status: 'lobby',
        playerCount: 1,
        players: {
            [myPlayerId]: {
                name: auth.currentUser.displayName || "Warrior",
                score: 0,
                status: 'waiting',
                avatar: '🎓'
            }
        },
        createdAt: serverTimestamp(),
        currentQuestionIndex: -1 // Host signals start by setting to 0
    };

    try {
        await setDoc(doc(db, 'rooms', roomId), initialData);
        
        if (type === 'private') {
            document.getElementById('room-code-display').style.display = 'block';
            document.getElementById('share-code').textContent = roomId;
            document.getElementById('lobby-status').textContent = "Waiting for friend...";
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
    myPlayerId = auth.currentUser.uid;
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

    await updateDoc(roomRef, {
        [`players.${myPlayerId}`]: {
            name: auth.currentUser.displayName || "Gladiator",
            score: 0,
            status: 'waiting',
            avatar: '⚡'
        },
        playerCount: 2
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
        
        // Lobby Sync
        if (data.status === 'lobby') {
            const playerIds = Object.keys(data.players);
            document.getElementById('p1-name').textContent = data.players[playerIds[0]].name;
            if (playerIds[1]) {
                document.getElementById('p2-name').textContent = data.players[playerIds[1]].name;
                document.getElementById('p2-avatar').textContent = '⚡';
                document.getElementById('lobby-status').textContent = "Match Found! Prepare for Battle...";
                if (isHost && data.playerCount === 2) {
                    setTimeout(() => prepareGame(), 2500);
                }
            }
        }

        // Game Start
        if (data.status === 'playing' && vsStatus !== 'playing') {
            vsQuestions = data.questions;
            vsStatus = 'playing';
            vsScore = 0;
            vsOpponentScore = 0;
            showVsScreen('quiz');
        }

        // Live Question Sync
        if (data.status === 'playing') {
            if (data.currentQuestionIndex !== vsCurrentIndex) {
                 vsCurrentIndex = data.currentQuestionIndex;
                 renderVsQuestion();
            }
            // Update HUD
            const pIds = Object.keys(data.players);
            const myData = data.players[myPlayerId];
            const oppId = pIds.find(id => id !== myPlayerId);
            const oppData = data.players[oppId];

            document.getElementById('vs-my-name').textContent = "You";
            document.getElementById('vs-my-score').textContent = myData.score;
            if (oppData) {
                document.getElementById('vs-opp-name').textContent = oppData.name;
                document.getElementById('vs-opp-score').textContent = oppData.score;
                vsOpponentScore = oppData.score;
            }

            // Sync host transition
            if (isHost && vsStatus === 'playing') {
                checkRoundOver(data);
            }
        }

        // Result Sync
        if (data.status === 'finished' && vsStatus === 'playing') {
            finishVsGame(data);
        }
    });

    // Cleanup on disconnect (Basic)
    window.addEventListener('beforeunload', leaveRoom);
}

async function prepareGame() {
    try {
        const res = await fetch('https://opentdb.com/api.php?amount=5&category=9&difficulty=medium&type=multiple');
        const json = await res.json();
        const questions = json.results.map(q => ({
            category: q.category,
            text: q.question,
            correct: q.correct_answer,
            options: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5)
        }));

        await updateDoc(doc(db, 'rooms', currentRoomId), {
            status: 'playing',
            questions: questions,
            currentQuestionIndex: 0
        });
    } catch (e) {
        console.error("Prep failed", e);
        leaveRoom();
    }
}

function renderVsQuestion() {
    const q = vsQuestions[vsCurrentIndex];
    document.getElementById('vs-q-count').textContent = `Question ${vsCurrentIndex + 1}/5`;
    document.getElementById('vs-category').textContent = q.category;
    document.getElementById('vs-q-text').innerHTML = q.text;
    
    const container = document.getElementById('vs-options');
    container.innerHTML = '';
    
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.onclick = () => submitVsAnswer(opt === q.correct);
        container.appendChild(btn);
    });

    startVsTimer();
}

let timeLeft = 50; // Use x10 for 0.1 increments
function startVsTimer() {
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    timeLeft = 50;
    const bar = document.getElementById('vs-count-bar');
    const txt = document.getElementById('vs-timer-text');
    
    vsTimerInterval = setInterval(() => {
        timeLeft -= 1;
        bar.style.width = `${(timeLeft / 50) * 100}%`;
        txt.textContent = `${Math.ceil(timeLeft / 10)}s`;

        if (timeLeft <= 0) {
            clearInterval(vsTimerInterval);
            submitVsAnswer(false);
        }
    }, 100);
}

async function submitVsAnswer(isCorrect) {
    if (vsTimerInterval) clearInterval(vsTimerInterval);
    
    let bonus = isCorrect ? Math.floor(timeLeft / 5) : 0; // max +10 bonus
    vsScore += isCorrect ? (10 + bonus) : 0;

    const options = document.querySelectorAll('#vs-options .option-btn');
    options.forEach(b => {
        b.disabled = true;
        // Visual feedback
        const q = vsQuestions[vsCurrentIndex];
        if (b.innerHTML === q.correct) b.style.borderColor = 'var(--success)';
        else if (b.disabled && !isCorrect) b.style.opacity = '0.5';
    });

    await updateDoc(doc(db, 'rooms', currentRoomId), {
        [`players.${myPlayerId}.score`]: vsScore,
        [`players.${myPlayerId}.status`]: 'answered'
    });
}

function checkRoundOver(data) {
    const pIds = Object.keys(data.players);
    const allAnswered = pIds.every(id => data.players[id].status === 'answered');

    if (allAnswered) {
        const nextIdx = data.currentQuestionIndex + 1;
        if (nextIdx < 5) {
            setTimeout(async () => {
                await updateDoc(doc(db, 'rooms', currentRoomId), {
                    currentQuestionIndex: nextIdx,
                    'players': Object.fromEntries(pIds.map(id => [id, { ...data.players[id], status: 'waiting' }]))
                });
            }, 1800);
        } else {
            setTimeout(async () => {
                await updateDoc(doc(db, 'rooms', currentRoomId), { status: 'finished' });
            }, 1800);
        }
    }
}

function finishVsGame(data) {
    vsStatus = 'finished';
    const myScore = vsScore;
    const oppScore = vsOpponentScore;

    showVsScreen('result');
    document.getElementById('vs-final-my-score').textContent = myScore;
    document.getElementById('vs-final-opp-score').textContent = oppScore;

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

async function leaveRoom() {
    if (roomListener) roomListener();
    if (isHost && currentRoomId) {
        await deleteDoc(doc(db, 'rooms', currentRoomId)).catch(() => {});
    }
    vsStatus = 'idle';
    showVsScreen('landing');
}
