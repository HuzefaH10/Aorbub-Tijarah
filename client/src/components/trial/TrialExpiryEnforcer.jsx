import { useEffect, useRef } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

/**
 * TrialExpiryEnforcer — Safety net that runs on app load.
 * 
 * If plan === 'pro' AND planExpiresAt is set AND planExpiresAt < now,
 * it updates Firestore to set plan: 'free' and planExpiresAt: null.
 * 
 * This ensures the plan field stays accurate even if the webhook missed
 * the trial expiry. Renders nothing — purely a side-effect component.
 */
export default function TrialExpiryEnforcer() {
  const { businessData, activeBusinessId } = useBusiness();
  const enforcedRef = useRef(false);

  useEffect(() => {
    if (!businessData || !activeBusinessId || enforcedRef.current) return;

    const plan = businessData.plan;
    const planExpiresAt = businessData.planExpiresAt?.toDate
      ? businessData.planExpiresAt.toDate()
      : (businessData.planExpiresAt ? new Date(businessData.planExpiresAt) : null);

    if (plan === 'pro' && planExpiresAt && planExpiresAt < new Date()) {
      // Trial has expired — downgrade to free
      enforcedRef.current = true;
      updateDoc(doc(db, 'businesses', activeBusinessId), {
        plan: 'free',
        planExpiresAt: null,
      }).then(() => {
        console.log('[TrialExpiryEnforcer] Trial expired — downgraded to free.');
      }).catch((err) => {
        console.error('[TrialExpiryEnforcer] Failed to downgrade:', err);
      });
    }
  }, [businessData, activeBusinessId]);

  return null;
}
