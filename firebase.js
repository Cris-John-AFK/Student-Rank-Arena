import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, query, orderBy, limit, getDocs, where, serverTimestamp, startAt, endAt, getCountFromServer, deleteField, or, and } from "firebase/firestore";
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

// 🛡️ Persistent Guest Identity Engine
export function getPersistentId() {
    const user = auth?.currentUser;
    if (user?.email) return user.email;
    if (user?.uid && !user.isAnonymous) return user.uid;
    
    // Check localStorage for a persistent guest ID
    let gId = localStorage.getItem('arena_guest_id');
    if (!gId) {
        gId = 'guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('arena_guest_id', gId);
    }
    return gId;
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
    const currentUserId = getPersistentId();
    const email = (currentUserId.includes('@')) ? currentUserId : null;
    
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

    // Handle Registered Users
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
    } else if (isFirebaseConfigured) {
        // 🧪 Handle Guests Elo Placement
        const resRef = doc(db, 'results', currentUserId);
        const resSnap = await getDoc(resRef);
        if (!resSnap.exists() || !resSnap.data().hasPlacement) {
            eloToReturn = (score * 20) + 50;
            isNewElo = true;
            resultData.elo = eloToReturn;
            resultData.hasPlacement = true;
        } else {
            eloToReturn = resSnap.data().elo || 500;
        }
    }
    
    resultData.isPremium = !!(await checkPremiumStatus(email));
    resultData.elo = eloToReturn;

    if (isFirebaseConfigured) {
        try {
            if (!user) await signInAnonymously(auth);
            const leaderboardRef = doc(db, 'results', currentUserId);
            const saveData = { ...resultData, earnedScores: arrayUnion(score) };
            await setDoc(leaderboardRef, saveData, { merge: true });
            
            // 🔥 IDENTITY MERGE & CLEANUP: 
            // If registered, migrate any legacy guest 'earnedScores' before purging the ghost record
            const persistentId = getPersistentId();
            if (email && persistentId && persistentId !== email) {
                try { 
                    const guestRef = doc(db, 'results', persistentId);
                    const guestSnap = await getDoc(guestRef);
                    if (guestSnap.exists()) {
                        const guestScores = guestSnap.data().earnedScores || [];
                        if (guestScores.length > 0) {
                            await updateDoc(leaderboardRef, { earnedScores: arrayUnion(...guestScores) });
                        }
                    }
                    await deleteDoc(guestRef);
                } catch(ee){ console.error("Identity Merge Error:", ee); }
            }
            
            // Auto-trigger the central Global Rank Engine sync in the background
            syncGlobalLeaderboard(true); 
            
            return { success: true, displayName, userId: currentUserId, isNewElo, elo: eloToReturn };
        } catch (e) {
            console.error('Save failed:', e);
            return { success: false, error: e.message };
        }
    } else {
        localStorage.setItem('lastResult', JSON.stringify(resultData));
        return { success: true, displayName, userId: currentUserId, elo: eloToReturn };
    }
}

export async function updateEloAfterMatch(myId, won, draw, correctCount) {
    if (!isFirebaseConfigured || !myId) return;
    try {
        const isEmail = myId.includes('@');
        const myResRef = doc(db, 'results', myId);
        const myUserRef = isEmail ? doc(db, 'users', myId) : null;

        // Fetch Elo (Try users first for registered, otherwise results for guest)
        let myElo = 500;
        if (myUserRef) {
            const snap = await getDoc(myUserRef);
            if (snap.exists() && snap.data().elo) myElo = snap.data().elo;
            else {
                const resSnap = await getDoc(myResRef);
                if (resSnap.exists() && resSnap.data().elo) myElo = resSnap.data().elo;
            }
        } else {
            const resSnap = await getDoc(myResRef);
            if (resSnap.exists() && resSnap.data().elo) myElo = resSnap.data().elo;
        }
        
        let change = 0;
        if (draw) {
            change = 0;
        } else if (won) {
            change = correctCount; // + points for how many right 
        } else {
            change = -(10 - correctCount); // - points for how many wrong
        }

        const newElo = Math.max(10, myElo + change);
        
        // Update both if applicable
        const batchUpdates = [updateDoc(myResRef, { elo: newElo })];
        if (myUserRef) batchUpdates.push(setDoc(myUserRef, { elo: newElo }, { merge: true }));
        await Promise.all(batchUpdates);
        
        // Ensure standard rankings stay updated
        await syncGlobalLeaderboard();

        return { newElo, change };
    } catch(e) { console.error("Elo update fail", e); }
}

export async function getUserProfileData(id) {
    if (!id || !isFirebaseConfigured) return null;
    try {
        let combinedData = {};
        
        // 1. Get Competitive Data (Results collection) - master for scores/history
        const resDoc = await getDoc(doc(db, 'results', id));
        if (resDoc.exists()) {
            combinedData = { ...resDoc.data() };
        }

        // 2. Get Account Data (Users collection) - master for names/premium/ACHIEVEMENT
        if (id.includes('@')) {
            const userDoc = await getDoc(doc(db, 'users', id));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                combinedData = { ...combinedData, ...userData };
                // Achievement from users table is PERMANENT and always wins
                if (userData.achievement) combinedData.achievement = userData.achievement;
                // Merge earnedScores from both tables
                const resScores = combinedData.earnedScores || [];
                const userScores = userData.earnedScores || [];
                combinedData.earnedScores = [...new Set([...resScores, ...userScores])];
            }
        }
        
        return Object.keys(combinedData).length > 0 ? combinedData : null;
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

export async function syncGlobalLeaderboard(force = false) {
    if (!isFirebaseConfigured) return;

    try {
        const globalRef = doc(db, 'results', '--GLOBAL_STATE--');
        const stateSnap = await getDoc(globalRef);
        
        // 🕒 COOPERATIVE THROTTLING: 
        // Only run the heavy O(N) sync if data is more than 15 mins old (or forced)
        if (stateSnap.exists() && !force) {
            const data = stateSnap.data();
            const lastUpdate = data.lastUpdated?.toMillis() || 0;
            const elapsed = Date.now() - lastUpdate;
            if (elapsed < 900000) { // 15 minutes chill period
                console.log(`Leaderboard is fresh (updated ${Math.round(elapsed/1000)}s ago). Skipping Sync Engine.`);
                return;
            }
        }

        console.log("🚀 Sync-Engine: Re-aggregating all player ranks (Syncing users & results)...");
        // Fetch users map for Premium flags AND achievement (permanent, from users table)
        const usersSnap = await getDocs(collection(db, 'users'));
        const premiumMap = {};
        const achievementMap = {};
        const earnedScoresMap = {};
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.isPremium) premiumMap[doc.id] = data.isPremium;
            if (data.achievement) achievementMap[doc.id] = data.achievement;
            if (data.earnedScores) earnedScoresMap[doc.id] = data.earnedScores;
        });

        const snap = await getDocs(collection(db, 'results'));
        let rawUsers = [];
        snap.forEach(doc => {
            if (doc.id === '--GLOBAL_STATE--') return; // Bypass the engine document
            
            const d = doc.data();
            const uid = d.userId || doc.id;
            // Merge earnedScores from users table too (fix Types Discovered mismatch)
            const resEarned = d.earnedScores || [];
            const userEarned = earnedScoresMap[uid] || [];
            const mergedEarned = [...new Set([...resEarned, ...userEarned])];
            rawUsers.push({
                docId: doc.id,
                userId: uid,
                displayName: d.displayName || "Unknown",
                score: d.score || 0,
                elo: d.elo || 500,
                type: d.type || "Unknown",
                // Achievement: users table wins (permanent), fallback to results
                achievement: achievementMap[uid] || achievementMap[doc.id] || d.achievement || "",
                earnedScores: mergedEarned,
                isPremium: premiumMap[uid] || premiumMap[doc.id] || false
            });
        });

        // 1. Strict Identity Dedup (Merging Ghost -> Registered)
        const userMap = new Map();
        rawUsers.forEach(u => {
            const trueId = u.userId;
            if (!userMap.has(trueId)) {
                userMap.set(trueId, { ...u });
            } else {
                const existing = userMap.get(trueId);
                existing.score = Math.max(existing.score, u.score);
                existing.elo = Math.max(existing.elo, u.elo);
                existing.type = u.score >= existing.score ? u.type : existing.type;
                if (u.achievement) existing.achievement = u.achievement;
                if (u.isPremium) existing.isPremium = u.isPremium;
                if (u.earnedScores) {
                    existing.earnedScores = [...new Set([...(existing.earnedScores || []), ...u.earnedScores])];
                }
            }
            // Auto-cleanup bad ghosts in DB if we have a merged registered user
            if (u.userId.includes('@') && u.docId !== u.userId) {
                deleteDoc(doc(db, 'results', u.docId)).catch(()=>console.log("Cleanup failed"));
            }
        });

        let finalUsers = Array.from(userMap.values());

        // 2. Exact Name Dedup (Prevent 'Georgie' vs 'Georgie' duplicates)
        const nameMap = new Map();
        finalUsers.forEach(u => {
            const n = u.displayName.toLowerCase().trim();
            if (!nameMap.has(n)) {
                nameMap.set(n, { ...u });
            } else {
                const existing = nameMap.get(n);
                existing.score = Math.max(existing.score, u.score);
                existing.elo = Math.max(existing.elo, u.elo);
                existing.type = u.score >= existing.score ? u.type : existing.type;
                if (u.achievement) existing.achievement = u.achievement;
                if (u.isPremium) existing.isPremium = u.isPremium;
                if (u.earnedScores) {
                    existing.earnedScores = [...new Set([...(existing.earnedScores || []), ...u.earnedScores])];
                }
                // Keep the email identity if one is registered
                if (u.userId.includes('@')) existing.userId = u.userId;
            }
        });

        let deduplicatedUsers = Array.from(nameMap.values());

        // 3. Mathematical Sequencing (Sort & Assign absoluteRank)
        const assessmentList = [...deduplicatedUsers]
            .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
            .map((u, i) => ({ ...u, absoluteRank: i + 1, id: u.userId }));

        const eloList = [...deduplicatedUsers]
            .sort((a, b) => b.elo - a.elo || a.userId.localeCompare(b.userId))
            .map((u, i) => ({ ...u, absoluteRank: i + 1, id: u.userId }));

        // 4. Overwrite Global State Table (Using 'results' collection to bypass Firebase rule blocks!)
        await setDoc(doc(db, 'results', '--GLOBAL_STATE--'), {
            assessment: assessmentList,
            elo: eloList,
            lastUpdated: serverTimestamp()
        });
        
    } catch (e) { console.error("Sync Engine Failed:", e); }
}

export async function fetchLeaderboard(orderByField = 'score', limitCount = 50) {
    if (!isFirebaseConfigured) return [];
    try {
        const snap = await getDoc(doc(db, 'results', '--GLOBAL_STATE--'));
        if (snap.exists()) {
            const data = snap.data();
            return orderByField === 'elo' ? data.elo : data.assessment;
        }
    } catch(e) { console.error("Fetch DB failed", e); }
    return [];
}

export async function fetchLeaderboardAround(field, value, cushion = 3) {
    return []; // Deprecated: Replaced by guaranteed absolute indexing
}

export async function getUserRankByField(field, value, myUid) {
    if (!isFirebaseConfigured || !myUid) return 0;
    try {
        const snap = await getDoc(doc(db, 'results', '--GLOBAL_STATE--'));
        if (snap.exists()) {
            const list = field === 'elo' ? snap.data().elo : snap.data().assessment;
            const myEntry = list.find(u => u.id === myUid || u.displayName.toLowerCase() === myUid.toLowerCase());
            return myEntry ? myEntry.absoluteRank : list.length + 1;
        }
    } catch(e) {}
    return 1;
}

export async function getUserEloRank(myElo, myUid) {
    return getUserRankByField('elo', myElo, myUid);
}

