import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// ⚠️ UPDATE THIS WITH YOUR ACTUAL FIREBASE CONFIG OR VERCEL ENV VARIABLES
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Check if configured to prevent breaking before user sets it up
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

export let app, db, auth;

if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}

// ==========================================
// Mocks for local testing without Firebase
// ==========================================
export async function authenticateUser(email, password, isSignUp, displayName) {
    if (isFirebaseConfigured) {
        try {
            if (isSignUp) {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                // In a real app we'd update profile with displayName
                return { success: true, user: userCredential.user };
            } else {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                return { success: true, user: userCredential.user };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // Mock success
        localStorage.setItem("mockUser", JSON.stringify({ email, displayName: displayName || email.split('@')[0] }));
        return { success: true, user: { email } };
    }
}

export function getCurrentUser() {
    if (isFirebaseConfigured) {
        return auth.currentUser;
    } else {
        return JSON.parse(localStorage.getItem("mockUser"));
    }
}

export async function saveUserResult(score, studentType, rankPercentile) {
    const user = getCurrentUser();
    const resultData = {
        userId: user ? user.uid || user.email : "guest",
        displayName: user ? user.displayName : "Guest",
        score,
        type: studentType,
        rank: rankPercentile,
        date: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
        try {
            await addDoc(collection(db, "results"), resultData);
            return true;
        } catch (e) {
            console.error("Error adding document: ", e);
            return false;
        }
    } else {
        const results = JSON.parse(localStorage.getItem('studentResults') || '[]');
        results.push(resultData);
        localStorage.setItem('studentResults', JSON.stringify(results));
        return true;
    }
}
