// Vercel Serverless Function - receives Xendit webhook after payment
// Automatically marks the user as premium in Firebase Firestore

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { credential } from 'firebase-admin';

// Init Firebase Admin (only once)
if (!getApps().length) {
    initializeApp({
        credential: credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = getFirestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // ✅ Verify the webhook is genuinely from Xendit
    const xenditToken = req.headers['x-callback-token'];
    if (xenditToken !== process.env.XENDIT_WEBHOOK_TOKEN) {
        console.error('Invalid Xendit webhook token');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body;

    // Only process successful payments
    if (body.status !== 'PAID' && body.status !== 'COMPLETED') {
        return res.status(200).json({ message: 'Event ignored.' });
    }

    // Extract user email from Xendit payment data
    // We pass the user email as `external_id` when creating payment links
    const userEmail = body.external_id || body?.payer_email || null;

    if (!userEmail) {
        console.error('No user email found in webhook payload:', body);
        return res.status(400).json({ error: 'No user email in payload' });
    }

    // Determine plan from amount paid
    let plan = 'monthly';
    const amount = body.amount;
    if (amount >= 149 && amount < 299) plan = 'lifetime';
    else if (amount >= 299) plan = 'yearly';

    // Save premium status to Firestore
    try {
        await db.collection('users').doc(userEmail).set({
            isPremium: true,
            plan: plan,
            paidAt: new Date().toISOString(),
            xenditPaymentId: body.id,
            amount: amount,
        }, { merge: true });

        console.log(`✅ Premium activated for: ${userEmail} (${plan})`);
        return res.status(200).json({ success: true, email: userEmail, plan });
    } catch (err) {
        console.error('Firestore write error:', err);
        return res.status(500).json({ error: 'Database error' });
    }
}
