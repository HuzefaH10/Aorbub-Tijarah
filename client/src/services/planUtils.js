/**
 * planUtils.js
 * Temporary pro-activation helper used until Stripe payments are live.
 * Replace startCheckout() calls with activateProNow() for testing.
 */

import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Immediately grants Pro access by writing to the business document.
 * BusinessContext's onSnapshot listener will pick this up in < 1 second
 * and isPro will become true across the entire app without a page reload.
 *
 * @param {string} businessId - The active business document ID
 */
export async function activateProNow(businessId) {
  if (!businessId) throw new Error('No businessId provided');
  await setDoc(
    doc(db, 'businesses', businessId),
    {
      plan: 'pro',
      planActivatedAt: serverTimestamp(),
      planExpiresAt: null,   // no expiry = permanent pro
      trialUsed: true,
    },
    { merge: true }
  );
}

/**
 * Switches the plan field on the business document.
 * Used only in the dev testing panel in Settings > Bill History.
 *
 * @param {string} businessId
 * @param {'pro'|'free'} plan
 */
export async function switchPlan(businessId, plan) {
  if (!businessId) throw new Error('No businessId provided');
  await setDoc(
    doc(db, 'businesses', businessId),
    {
      plan,
      ...(plan === 'pro' ? {
        planActivatedAt: serverTimestamp(),
        planExpiresAt: null,
        trialUsed: true,
      } : {
        planActivatedAt: null,
        planExpiresAt: null,
      }),
    },
    { merge: true }
  );
}
