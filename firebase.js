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
// ================================================
export async function checkPremiumStatus(email) {
    if (!email) return false;
    if (isFirebaseConfigured) {
        try {
            const userDoc = await getDoc(doc(db, 'users', email));
            if (userDoc.exists()) return userDoc.data().isPremium === true;
        } catch (e) { console.warn('Premium check failed:', e); }
        return false;
    }
    const user = JSON.parse(localStorage.getItem('mockUser') || 'null');
    return user?.isPremium === true;
}

// ================================================
// Save Quiz Result
// ================================================
export async function saveUserResult(score, studentType, rankPercentile) {
    const user = getCurrentUser();
    const email = user?.email || 'guest';
    const resultData = {
        userId: email,
        displayName: user?.displayName || email.split('@')[0],
        score, type: studentType, rank: rankPercentile,
        date: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
        try {
            await addDoc(collection(db, 'results'), resultData);
            await setDoc(doc(db, 'users', email), {
                lastScore: score, lastRank: rankPercentile,
                lastType: studentType, lastPlayed: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (e) { console.error('Save failed:', e); return false; }
    } else {
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        results.push(resultData);
        localStorage.setItem('studentResults', JSON.stringify(results));
        return true;
    }
}
