// Vercel Serverless Function - PayMongo Webhook Handler
// Fires when a student successfully pays → marks them as Premium in Firebase

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Init Firebase Admin (only once across hot reloads)
if (!getApps().length) {
    initializeApp({
        credential: cert({
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

    // ✅ Verify PayMongo webhook signature
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['paymongo-signature'];
    const secret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (secret && signature) {
        const [tPart, tePart, lePart] = signature.split(',');
        const timestamp = tPart?.split('=')[1];
        const signedPayload = `${timestamp}.${rawBody}`;
        
        const expectedSig = crypto
            .createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

        const testSig = tePart?.split('=')[1];
        const liveSig = lePart?.split('=')[1];

        if (expectedSig !== testSig && expectedSig !== liveSig) {
            console.error('Invalid PayMongo signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }

    const event = req.body;
    const eventType = event?.data?.attributes?.type;

    // Only process successful payments
    if (eventType !== 'payment.paid' && eventType !== 'link.payment.paid') {
        return res.status(200).json({ message: `Event "${eventType}" ignored.` });
    }

    // Extract payer email from billing info or metadata
    const attributes = event?.data?.attributes?.data?.attributes;
    const userEmail = 
        attributes?.billing?.email ||
        attributes?.metadata?.user_email ||
        null;

    if (!userEmail) {
        console.error('No user email found in PayMongo webhook. Payload:', JSON.stringify(event, null, 2));
        return res.status(400).json({ error: 'No user email found' });
    }

    // Determine plan tier from amount (PayMongo uses centavos: ₱149 = 14900)
    const amountCentavos = attributes?.amount || 0;
    let plan = 'monthly';
    if (amountCentavos >= 14900 && amountCentavos < 29900) plan = 'lifetime';
    else if (amountCentavos >= 29900) plan = 'yearly';

    // ✅ Write isPremium: true to Firestore
    try {
        await db.collection('users').doc(userEmail).set({
            isPremium: true,
            plan,
            paidAt: new Date().toISOString(),
            paymongoPaymentId: attributes?.id || 'unknown',
            amountPaid: amountCentavos / 100,
        }, { merge: true });

        console.log(`✅ Premium activated: ${userEmail} (${plan}, ₱${amountCentavos / 100})`);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Firestore error:', err);
        return res.status(500).json({ error: 'Firestore write failed' });
    }
}
