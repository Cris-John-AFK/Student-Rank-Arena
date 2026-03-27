import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, query, orderBy, limit, getDocs, where, serverTimestamp, startAt, endAt, getCountFromServer } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, setPersistence, browserLocalPersistence, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const isFirebaseConfigured = 
    firebaseConfig.apiKey !== "" && firebaseConfig.projectId !== "";

export let app, db, auth;

if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch(console.error);
}

export function onUserStateChange(callback) {
    if (!isFirebaseConfigured) {
        const user = JSON.parse(localStorage.getItem('mockUser') || 'null');
        callback(user);
        return () => {};
    }
    return onAuthStateChanged(auth, callback);
}

export async function authenticateUser(email, password, isSignUp, displayName) {
    if (isFirebaseConfigured) {
        try {
            let userCredential;
            if (isSignUp) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (displayName) await updateProfile(userCredential.user, { displayName });
                await setDoc(doc(db, 'users', email), {
                    displayName: displayName || email.split('@')[0],
                    email,
                    isPremium: false,
                    createdAt: new Date().toISOString(),
                    elo: 500,
                    hasPlacement: false
                }, { merge: true });
            } else {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            }
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        if (isSignUp) {
            const userData = { email, displayName: displayName || email.split('@')[0], isPremium: false };
            localStorage.setItem('mockUser', JSON.stringify(userData));
        }
        return { success: true, user: JSON.parse(localStorage.getItem('mockUser')) };
    }
}

export function getCurrentUser() {
    if (isFirebaseConfigured) return auth?.currentUser;
    return JSON.parse(localStorage.getItem('mockUser') || 'null');
}

export async function checkPremiumStatus(email) {
    if (!email || !isFirebaseConfigured) return null;
    try {
        const userDoc = await getDoc(doc(db, 'users', email));
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (!data.isPremium) return null;
            return { isPremium: true, plan: data.plan || 'lifetime' };
        }
    } catch (e) { console.warn('Premium check failed:', e); }
    return null;
}

export async function saveUserResult(score, studentType, rankPercentile, guestNickname = null) {
    const user = getCurrentUser();
    const email = user?.email || null;
    
    // Canonical ID policy
    const currentUserId = email || auth?.currentUser?.uid || `guest_${Date.now()}`;
    let displayName = user?.displayName || guestNickname || "Anonymous Student";
    if (!displayName && email) displayName = email.split('@')[0];

    const resultData = {
        userId: currentUserId,
        displayName,
        score,
        type: studentType,
        rank: rankPercentile,
        date: new Date().toISOString(),
    };

    let eloToReturn = 500;
    let isNewElo = false;

    if (isFirebaseConfigured && email) {
        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);
            let updates = {
                lastScore: score,
                lastRank: rankPercentile,
                lastType: studentType,
                lastPlayed: new Date().toISOString()
            };

            if (!userSnap.exists() || !userSnap.data().hasPlacement) {
                eloToReturn = (score * 20) + 50;
                updates.elo = eloToReturn;
                updates.hasPlacement = true;
                updates.bestScore = score;
                updates.bestType = studentType;
                isNewElo = true;
            } else {
                const existingData = userSnap.data();
                eloToReturn = existingData.elo || 500;
                if (score > (existingData.bestScore || 0)) {
                    updates.bestScore = score;
                    updates.bestType = studentType;
                }
            }
            await setDoc(userRef, updates, { merge: true });
        } catch (e) { console.error("Save error:", e); }
    }
    
    resultData.isPremium = !!(await checkPremiumStatus(email));
    // Sync Elo to results collection for leaderboard sorting
    resultData.elo = eloToReturn;

    if (isFirebaseConfigured) {
        try {
            if (!email) await signInAnonymously(auth);
            const leaderboardRef = doc(db, 'results', currentUserId);
            const saveData = { ...resultData, earnedScores: arrayUnion(score) };
            await setDoc(leaderboardRef, saveData, { merge: true });
            
            return { 
                success: true, 
                displayName, 
                userId: currentUserId, 
                isNewElo: isNewElo, 
                elo: eloToReturn 
            };
        } catch (e) {
            console.error('Save failed:', e);
            return { success: false, error: e.message };
        }
    } else {
        localStorage.setItem('lastResult', JSON.stringify(resultData));
        return { success: true, displayName, userId: currentUserId, elo: eloToReturn };
    }
}

export async function updateEloAfterMatch(myEmail, opponentEmail, won, myScore, oppScore) {
    if (!isFirebaseConfigured || !myEmail) return;
    try {
        const myRef = doc(db, 'users', myEmail);
        const [mySnap] = await Promise.all([getDoc(myRef)]);
        
        const myElo = mySnap.exists() ? (mySnap.data().elo || 500) : 500;
        
        let change = 0;
        if (won) {
            change = 10 + (myScore * 2); 
        } else {
            const wrongCount = Math.max(0, 10 - myScore);
            change = -(10 + (wrongCount * 2));
        }

        if (myScore === oppScore) change = 0;
        
        const newElo = Math.max(10, myElo + change);
        await updateDoc(myRef, { elo: newElo });

        // Sync to results collection for leaderboard
        const resultsRef = doc(db, 'results', myEmail);
        await updateDoc(resultsRef, { elo: newElo });

        return { newElo, change };
    } catch(e) { console.error("Elo update fail", e); }
}

export async function getUserProfileData(email) {
    if (!email || !isFirebaseConfigured) return null;
    try {
        const userDoc = await getDoc(doc(db, 'users', email));
        return userDoc.exists() ? userDoc.data() : null;
    } catch (e) { console.error("Profile fetch failed:", e); return null; }
}

export async function fetchUserResults(userId) {
    if (!userId || !isFirebaseConfigured) return [];
    try {
        const docRef = doc(db, 'results', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return [{ id: docSnap.id, ...docSnap.data() }];
        
        const resultsRef = collection(db, 'results');
        const q = query(resultsRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);
        const myData = [];
        querySnapshot.forEach((doc) => { myData.push({ id: doc.id, ...doc.data() }); });
        return myData.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) { console.error("User results fetch failed:", e); return []; }
}

export async function fetchLeaderboard(orderByField = 'score', limitCount = 50) {
    if (!isFirebaseConfigured) return null;
    try {
        const resultsRef = collection(db, 'results');
        const q = query(resultsRef, orderBy(orderByField, 'desc'), limit(limitCount));
        const querySnapshot = await getDocs(q);
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const actualIdInDoc = data.userId || null;
            if (actualIdInDoc && actualIdInDoc.includes('@') && doc.id !== actualIdInDoc) return;
            leaderboardData.push({ id: doc.id, ...data });
        });
        return leaderboardData;
    } catch (e) { console.error("Leaderboard fetch failed:", e); return []; }
}

/**
 * 🏆 Fetches a slice of the leaderboard around a given value.
 */
export async function fetchLeaderboardAround(field, value, cushion = 3) {
    if (!isFirebaseConfigured) return [];
    try {
        const resultsRef = collection(db, 'results');
        const qHigh = query(resultsRef, where(field, '>=', value), orderBy(field, 'asc'), limit(cushion + 1));
        const qLow = query(resultsRef, where(field, '<', value), orderBy(field, 'desc'), limit(cushion));

        const [snapHigh, snapLow] = await Promise.all([getDocs(qHigh), getDocs(qLow)]);
        const highData = [];
        snapHigh.forEach(doc => highData.push({ id: doc.id, ...doc.data() }));
        highData.reverse();

        const lowData = [];
        snapLow.forEach(doc => lowData.push({ id: doc.id, ...doc.data() }));

        return [...highData, ...lowData];
    } catch (e) { console.error("Around-me fetch failed:", e); return []; }
}

/**
 * 🏆 Calculates the global Elo rank of a user
 */
export async function getUserEloRank(myElo) {
    if (!isFirebaseConfigured) return null;
    try {
        const resultsRef = collection(db, 'results');
        const q = query(resultsRef, where('elo', '>', myElo));
        const snapshot = await getCountFromServer(q);
        return (snapshot.data().count || 0) + 1;
    } catch (e) { console.error("Rank fetch failed:", e); return null; }
}
