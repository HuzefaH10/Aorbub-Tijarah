import React, { useState, useEffect } from 'react';
import { usePlan } from '../../hooks/usePlan';
import { useBusiness } from '../../context/BusinessContext';
import { useNavigate } from 'react-router-dom';
import { X, Crown, AlertTriangle } from 'lucide-react';

const DISMISS_KEY = 'trial_banner_dismissed_at';
const EXPIRED_SHOWN_KEY = 'trial_expired_modal_shown';
const RESHOW_DAYS = 3;

/**
 * TrialBanner — Shows a subtle info bar for trial users.
 * - Normal state: gold info bar with days remaining
 * - Warning state (≤3 days): amber/warning bar with urgency
 * - Dismissible, re-shows every 3 days
 */
export function TrialBanner() {
  const { isTrialActive, daysLeftInTrial, isPro, planExpiresAt } = usePlan();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed) {
      const daysSinceDismiss = (Date.now() - Number(lastDismissed)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < RESHOW_DAYS) {
        setDismissed(true);
      }
    }
  }, []);

  // Only show for trial users (Pro with an expiry date), not permanent Pro
  if (!isTrialActive || dismissed) return null;

  const isUrgent = daysLeftInTrial !== null && daysLeftInTrial <= 3;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleUpgrade = () => {
    navigate('/settings?tab=bills');
  };

  return (
    <div className={`w-full px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium relative z-30 transition-colors ${
      isUrgent 
        ? 'bg-amber-500/15 text-amber-300 border-b border-amber-500/20'
        : 'bg-amber-500/10 text-amber-400/90 border-b border-amber-500/10'
    }`}>
      <span className="flex items-center gap-2 flex-wrap justify-center">
        {isUrgent ? (
          <>
            <AlertTriangle size={15} className="shrink-0" />
            <span>Your Pro trial expires in <strong>{daysLeftInTrial}</strong> day{daysLeftInTrial !== 1 ? 's' : ''}. Upgrade now to keep all your data and access.</span>
          </>
        ) : (
          <>
            <span>🎉</span>
            <span>You're on a free Pro trial — <strong>{daysLeftInTrial}</strong> day{daysLeftInTrial !== 1 ? 's' : ''} remaining. Upgrade to keep access.</span>
          </>
        )}
      </span>
      <button
        onClick={handleUpgrade}
        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
          isUrgent
            ? 'bg-amber-500 text-black hover:bg-amber-400'
            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
        }`}
      >
        {isUrgent ? 'Upgrade Before It Expires' : 'Upgrade Now'}
      </button>
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-amber-500/50 hover:text-amber-400 transition-colors"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * TrialExpiredModal — One-time modal shown when trial has just expired.
 * Shows only once (stored in localStorage).
 */
export function TrialExpiredModal() {
  const { isFree, trialUsed, isExpired } = usePlan();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show only if: user is on free, trial was used (meaning they had a trial),
    // and we haven't shown this modal before
    if (isFree && trialUsed && !localStorage.getItem(EXPIRED_SHOWN_KEY)) {
      setShow(true);
    }
  }, [isFree, trialUsed]);

  if (!show) return null;

  const handleClose = () => {
    localStorage.setItem(EXPIRED_SHOWN_KEY, 'true');
    setShow(false);
    navigate('/settings?tab=bills');
  };

  const handleDismiss = () => {
    localStorage.setItem(EXPIRED_SHOWN_KEY, 'true');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl w-full max-w-md p-8 text-center shadow-2xl animate-[slideUp_0.3s_ease-out]">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto mb-5">
          <Crown size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading mb-2">
          Your Pro trial has ended
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          You're now on the Free plan. Your data is safe — upgrade anytime to restore full access to invoicing, analytics, staff management and more.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleClose}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 transition-all"
          >
            See Plans
          </button>
          <button
            onClick={handleDismiss}
            className="w-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-semibold text-sm py-2 transition-colors"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
