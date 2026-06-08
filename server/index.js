import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import admin from 'firebase-admin';

// ── Firebase Admin Init ──
// Uses GOOGLE_APPLICATION_CREDENTIALS env var or default credentials
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const firestore = admin.firestore();

// ── Stripe Init ──
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Stripe Webhook must use raw body ──
// This MUST come before express.json() middleware
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { businessId, userId } = session.metadata || {};

        if (businessId) {
          await firestore.doc(`businesses/${businessId}`).set({
            plan: 'pro',
            planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            planExpiresAt: null,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          }, { merge: true });

          // Write billing record
          await firestore.collection(`businesses/${businessId}/billing`).add({
            date: admin.firestore.FieldValue.serverTimestamp(),
            planName: 'Pro',
            amount: session.amount_total ? `AED ${(session.amount_total / 100).toFixed(2)}` : 'N/A',
            status: 'paid',
            stripeSessionId: session.id,
            stripeInvoiceId: session.invoice || null,
          });

          console.log(`✅ Business ${businessId} upgraded to Pro`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        // Find business by stripeSubscriptionId
        const snapshot = await firestore
          .collection('businesses')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const bizDoc = snapshot.docs[0];
          await bizDoc.ref.update({
            plan: 'free',
            planExpiresAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`⚠️  Business ${bizDoc.id} subscription cancelled → downgraded to free`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Find business by stripeCustomerId
        const snapshot = await firestore
          .collection('businesses')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const bizDoc = snapshot.docs[0];
          // Write a notification
          await firestore.collection(`businesses/${bizDoc.id}/notifications`).add({
            type: 'payment_failed',
            title: 'Payment Failed',
            message: 'Your Pro plan payment failed. Please update your payment method to keep Pro features.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
          console.log(`❌ Payment failed for business ${bizDoc.id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook event:', err);
  }

  res.json({ received: true });
});

// ── Standard Middleware (after webhook route) ──
app.use(cors({ origin: true }));
app.use(express.json());

// ── Health Check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Aorbub Tijarah API is running' });
});

// ── Auth Middleware ──
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ══════════════════════════════════════════════
//  STRIPE CHECKOUT SESSION
// ══════════════════════════════════════════════
app.post('/api/stripe/create-checkout-session', verifyAuth, async (req, res) => {
  try {
    const { businessId, priceId } = req.body;
    const userId = req.user.uid;

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    const finalPriceId = priceId || process.env.STRIPE_PRICE_ID;
    if (!finalPriceId || finalPriceId === 'price_REPLACE_ME') {
      return res.status(500).json({ error: 'Stripe Price ID not configured. Set STRIPE_PRICE_ID in server .env' });
    }

    // Check if business already has a Stripe customer
    const bizDoc = await firestore.doc(`businesses/${businessId}`).get();
    const bizData = bizDoc.exists ? bizDoc.data() : {};
    let customerId = bizData.stripeCustomerId || null;

    // Get user email from Firebase Auth
    const userRecord = await admin.auth().getUser(userId);
    const customerEmail = userRecord.email;

    // Create or reuse Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: { businessId, userId, firebaseUID: userId },
      });
      customerId = customer.id;
      // Persist immediately
      await firestore.doc(`businesses/${businessId}`).set(
        { stripeCustomerId: customerId },
        { merge: true }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: finalPriceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/settings?tab=bills&upgrade=success`,
      cancel_url: `${FRONTEND_URL}/settings?tab=bills&upgrade=cancelled`,
      metadata: { businessId, userId },
      subscription_data: {
        metadata: { businessId, userId },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  BILLING HISTORY (from Stripe)
// ══════════════════════════════════════════════
app.get('/api/stripe/billing-history', verifyAuth, async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    const bizDoc = await firestore.doc(`businesses/${businessId}`).get();
    const bizData = bizDoc.exists ? bizDoc.data() : {};
    const customerId = bizData.stripeCustomerId;

    if (!customerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 50,
    });

    const formatted = invoices.data.map(inv => ({
      id: inv.id,
      date: new Date(inv.created * 1000).toISOString(),
      planName: 'Pro',
      amount: `AED ${(inv.amount_paid / 100).toFixed(2)}`,
      amountRaw: inv.amount_paid,
      status: inv.status,  // 'paid', 'open', 'void', 'uncollectible'
      invoiceUrl: inv.hosted_invoice_url || null,
      invoicePdf: inv.invoice_pdf || null,
    }));

    res.json({ invoices: formatted });
  } catch (err) {
    console.error('Error fetching billing history:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy Placeholder Routes ──
app.get('/api/entries', (req, res) => {
  res.json({ message: 'Entries are managed via Firestore client SDK' });
});

app.get('/api/products', (req, res) => {
  res.json({ message: 'Products are managed via Firestore client SDK' });
});

app.get('/api/events', (req, res) => {
  res.json({ message: 'Events are managed via Firestore client SDK' });
});

app.listen(PORT, () => {
  console.log(`🚀 Aorbub Tijarah Server running on port ${PORT}`);
});
