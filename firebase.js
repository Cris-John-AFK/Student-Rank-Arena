import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

// ⚠️ Reads from Vercel Environment Variables (set these in your Vercel dashboard)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

export let app, db, auth;

if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
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
                if (displayName) {
                    await updateProfile(userCredential.user, { displayName });
                }
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
        // localhost mock
        const key = `mockUser_${email}`;
        if (isSignUp) {
            const userData = { email, displayName: displayName || email.split('@')[0], isPremium: false };
            localStorage.setItem('mockUser', JSON.stringify(userData));
        } else {
            const existing = localStorage.getItem('mockUser');
            if (!existing) return { success: false, error: 'No account found. Please sign up.' };
            localStorage.setItem('mockUser', existing);
        }
        return { success: true, user: JSON.parse(localStorage.getItem('mockUser')) };
    }
}

// ================================================
// Get current logged-in user
// ================================================
export function getCurrentUser() {
    if (isFirebaseConfigured) {
        return auth.currentUser;
    } else {
        return JSON.parse(localStorage.getItem('mockUser'));
    }
}

// ================================================
// Check Premium Status from Firestore
// ================================================
export async function checkPremiumStatus(email) {
    if (!email) return false;

    if (isFirebaseConfigured) {
        try {
            const userDoc = await getDoc(doc(db, 'users', email));
            if (userDoc.exists()) {
                return userDoc.data().isPremium === true;
            }
        } catch (e) {
            console.warn('Could not check premium status:', e);
        }
        return false;
    } else {
        // mock: check if the mock user has isPremium
        const user = JSON.parse(localStorage.getItem('mockUser'));
        return user?.isPremium === true;
    }
}

// ================================================
// Save Quiz Result to Firestore
// ================================================
export async function saveUserResult(score, studentType, rankPercentile) {
    const user = getCurrentUser();
    const email = user?.email || 'guest';
    const resultData = {
        userId: email,
        displayName: user?.displayName || email.split('@')[0],
        score,
        type: studentType,
        rank: rankPercentile,
        date: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
        try {
            await addDoc(collection(db, 'results'), resultData);
            // Also update best score on user doc
            await setDoc(doc(db, 'users', email), {
                lastScore: score,
                lastRank: rankPercentile,
                lastType: studentType,
                lastPlayed: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (e) {
            console.error("Error saving result:", e);
            return false;
        }
    } else {
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        results.push(resultData);
        localStorage.setItem('studentResults', JSON.stringify(results));
        return true;
    }
}
