import { useBusiness } from '../context/BusinessContext';

export function usePlan() {
  const { businessData } = useBusiness();

  const plan = businessData?.plan || 'free';
  const planExpiresAt = businessData?.planExpiresAt?.toDate 
    ? businessData.planExpiresAt.toDate() 
    : (businessData?.planExpiresAt ? new Date(businessData.planExpiresAt) : null); // Fallback if it's already a date/string

  const now = new Date();
  
  // A plan is considered expired if it has an expiry date that has passed
  const isExpired = planExpiresAt ? planExpiresAt < now : false;

  // If the pro plan has expired, treat it as free
  const effectivePlan = (plan === 'pro' && isExpired) ? 'free' : plan;

  const isPro = effectivePlan === 'pro';
  const isFree = effectivePlan === 'free';
  
  // A trial is active if it's pro, AND there is an expiry date in the future
  const isTrialActive = isPro && planExpiresAt !== null && !isExpired;

  let daysLeftInTrial = null;
  if (isTrialActive) {
    const diffTime = Math.abs(planExpiresAt - now);
    daysLeftInTrial = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    plan: effectivePlan,
    isPro,
    isFree,
    isTrialActive,
    daysLeftInTrial,
    trialUsed: businessData?.trialUsed || false,
    planActivatedAt: businessData?.planActivatedAt || null,
    planExpiresAt,
    isExpired,
  };
}
