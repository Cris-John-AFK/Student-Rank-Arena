import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";

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
    // ✅ Persist login across page reloads/navigation
    setPersistence(auth, browserLocalPersistence).catch(console.error);
}

// ================================================
// AUTH STATE LISTENER — Call this on app start
// Returns a cleanup function
// ================================================
export function onUserStateChange(callback) {
    if (!isFirebaseConfigured) {
        // Mock: restore from localStorage
        const user = JSON.parse(localStorage.getItem('mockUser') || 'null');
        callback(user);
        return () => {};
    }
    return onAuthStateChanged(auth, callback);
}

// ================================================
// AUTH: Register or Login
// ================================================
export async function authenticateUser(email, password, isSignUp, displayName) {
    if (isFirebaseConfigured) {
        try {
            let userCredential;
            if (isSignUp) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (displayName) await updateProfile(userCredential.user, { displayName });
                // Create user doc in Firestore
                await setDoc(doc(db, 'users', email), {
                    displayName: displayName || email.split('@')[0],
                    email,
                    isPremium: false,
                    createdAt: new Date().toISOString()
                }, { merge: true });
            } else {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            }
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // localhost mock (no Firebase keys)
        if (isSignUp) {
            const userData = { email, displayName: displayName || email.split('@')[0], isPremium: false };
            localStorage.setItem('mockUser', JSON.stringify(userData));
        } else {
            const existing = localStorage.getItem('mockUser');
            if (!existing) return { success: false, error: 'No account found. Please sign up first.' };
        }
        return { success: true, user: JSON.parse(localStorage.getItem('mockUser')) };
    }
}

export function getCurrentUser() {
    if (isFirebaseConfigured) return auth?.currentUser;
    return JSON.parse(localStorage.getItem('mockUser') || 'null');
}

// ================================================
// Check Premium Status from Firestore
// Returns: null (not premium) or { isPremium, plan, paidAt, expiresAt }
// ================================================
export async function checkPremiumStatus(email) {
    if (!email) return null;
    if (isFirebaseConfigured) {
        try {
            const userDoc = await getDoc(doc(db, 'users', email));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (!data.isPremium) return null;
                const paidAt = data.paidAt || null;
                const plan = data.plan || 'lifetime';
                let expiresAt = null;
                if (plan === 'monthly' && paidAt) {
                    const paid = new Date(paidAt);
                    paid.setDate(paid.getDate() + 30);
                    expiresAt = paid.toISOString();
                    // if expired, no longer premium
                    if (new Date() > paid) return null;
                }
                return { isPremium: true, plan, paidAt, expiresAt };
            }
        } catch (e) { console.warn('Premium check failed:', e); }
        return null;
    }
    // Mock fallback
    const user = JSON.parse(localStorage.getItem('mockUser') || 'null');
    if (user?.isPremium) return { isPremium: true, plan: user.plan || 'lifetime', paidAt: null, expiresAt: null };
    return null;
}

// ================================================
// Save Quiz Result
// ================================================
export async function saveUserResult(score, studentType, rankPercentile, guestNickname = null) {
    const user = getCurrentUser();
    const email = user?.email || null;
    
    // Generate unique ID for guests or use email for users
    const userId = email || `guest_${Date.now()}`;
    const displayName = user?.displayName || guestNickname || `Anonymous Student`;

    const resultData = {
        userId,
        displayName,
        score,
        type: studentType,
        rank: rankPercentile,
        date: new Date().toISOString(),
        isPremium: !!(await checkPremiumStatus(email))
    };

    if (isFirebaseConfigured) {
        try {
            // Save to global results
            await addDoc(collection(db, 'results'), resultData);
            
            // If logged in, also update user document
            if (email) {
                await setDoc(doc(db, 'users', email), {
                    lastScore: score,
                    lastRank: rankPercentile,
                    lastType: studentType,
                    lastPlayed: new Date().toISOString()
                }, { merge: true });
            }
            return { success: true, displayName };
        } catch (e) {
            console.error('Save failed:', e);
            return { success: false };
        }
    } else {
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        results.push(resultData);
        localStorage.setItem('studentResults', JSON.stringify(results));
        return { success: true, displayName };
    }
}

// ================================================
// Fetch Leaderboard (Real Firestore Data)
// ================================================
export async function fetchLeaderboard(limitCount = 20) {
    if (!isFirebaseConfigured) return null;

    try {
        const { query, collection, orderBy, limit, getDocs } = await import("firebase/firestore");
        const resultsRef = collection(db, 'results');
        
        // Query for top scores (closest to 0 is better for rank/score in some logics, 
        // but here totalScore represents performance where lower score/percentile is better)
        // Let's sort by score ascending (Rank 1 is best)
        const q = query(resultsRef, orderBy('score', 'asc'), limit(limitCount));
        const querySnapshot = await getDocs(q);
        
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            leaderboardData.push({ id: doc.id, ...doc.data() });
        });
        
        return leaderboardData;
    } catch (e) {
        console.error("Leaderboard fetch failed:", e);
        return [];
    }
}
