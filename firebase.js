import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc } from "firebase/firestore";
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
    let userId = email || `guest_${Date.now()}`;
    let displayName = user?.displayName || guestNickname;
    
    // 🔥 Fix: If logged in but name is null/Anonymous, fallback to email prefix
    if (!displayName && email) {
        displayName = email.split('@')[0];
    } else if (!displayName) {
        displayName = "Anonymous Student";
    }

    const resultData = {
        userId,
        displayName,
        score,
        type: studentType, // Use the specific granular type, not the broad rarity tag
        rank: rankPercentile,
        date: new Date().toISOString(),
        isPremium: !!(await checkPremiumStatus(email))
    };

    if (isFirebaseConfigured) {
        try {
            // 🛡️ Anonymous Auth for strict Firestore rules check
            if (!email) {
                // Creates an anonymous authenticated session so Firestore doesn't block unauthenticated saves
                await signInAnonymously(auth);
                const aUser = auth.currentUser;
                if (aUser) {
                    userId = aUser.uid; 
                    resultData.userId = userId;
                    
                    // 💾 Identity Persistence: Lock their typed nickname into their anonymous profile
                    if (guestNickname && aUser.displayName !== guestNickname) {
                        try {
                            await updateProfile(aUser, { displayName: guestNickname });
                        } catch(e) { console.warn('Failed to lock guest nickname:', e); }
                    }
                }
            }

            // 🏆 Leaderboard Cleanliness: One entry per user
            // We use the userId (email for logged-in users) as the document ID
            const leaderboardRef = doc(db, 'results', userId);
            
            // 🔄 ALWAYS UPDATE: We want the LATEST quiz attempt to be the user's rank. 
            // This allows users to drop into the Chaos tier if they retake the quiz!
            if (email) {
                await setDoc(leaderboardRef, resultData, { merge: true });
            } else {
                await setDoc(leaderboardRef, resultData);
            }

            // If logged in, ALSO update their permanent user profile document
            if (email) {
                const userDocRef = doc(db, 'users', email);
                let updateUserData = {
                    lastScore: score,
                    lastRank: rankPercentile,
                    lastType: studentType,
                    lastPlayed: new Date().toISOString(),
                    bestScore: score, 
                    bestType: studentType
                };
                await setDoc(userDocRef, updateUserData, { merge: true });
            }
            return { success: true, displayName, userId };
        } catch (e) {
            console.error('Save failed:', e);
            return { success: false, error: e.message };
        }
    } else {
        // Fallback for no firebase
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        results.push(resultData);
        localStorage.setItem('studentResults', JSON.stringify(results));
        return { success: true, displayName, userId };
    }
}

export async function getUserProfileData(email) {
    if (!email || !isFirebaseConfigured) return null;
    try {
        const { getDoc, doc } = await import("firebase/firestore");
        const userDoc = await getDoc(doc(db, 'users', email));
        if (userDoc.exists()) {
            return userDoc.data();
        }
    } catch (e) {
        console.error("Profile fetch failed:", e);
    }
    return null;
}

// ================================================
// Fetch Results for a Specific User
// ================================================
export async function fetchUserResults(email) {
    if (!email || !isFirebaseConfigured) return [];
    try {
        const { query, collection, where, getDocs } = await import("firebase/firestore");
        const resultsRef = collection(db, 'results');
        // 🔑 We remove orderBy from the query to avoid needing a Composite Index in Firebase Console
        const q = query(resultsRef, where('userId', '==', email));
        const querySnapshot = await getDocs(q);
        
        const myData = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 🛡️ Legacy Cleanup: Ignore old auto-generated ID documents to prevent overlapping duplicates
            if (doc.id !== email) return; 
            myData.push({ id: doc.id, ...data });
        });

        // 🏆 Sort in JS instead to stay index-free
        return myData.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
        console.error("User results fetch failed:", e);
        return [];
    }
}

// ================================================
// Fetch Leaderboard (Real Firestore Data)
// ================================================
export async function fetchLeaderboard(limitCount = 100) {
    if (!isFirebaseConfigured) return null;

    try {
        const { query, collection, orderBy, limit, getDocs } = await import("firebase/firestore");
        const resultsRef = collection(db, 'results');
        
        // We fetch a larger pool (100) to allow JS-side filtering of Top vs Chaos
        const q = query(resultsRef, orderBy('score', 'desc'), limit(limitCount));
        const querySnapshot = await getDocs(q);
        
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 🛡️ Legacy Cleanup: If this is an authenticated user, only trust the canonical doc (ID = email)
            if (data.userId && data.userId.includes('@') && doc.id !== data.userId) return;
            leaderboardData.push({ id: doc.id, ...data });
        });
        
        return leaderboardData;
    } catch (e) {
        console.error("Leaderboard fetch failed:", e);
        return [];
    }
}
