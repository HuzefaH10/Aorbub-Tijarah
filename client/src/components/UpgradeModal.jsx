import React, { useState } from 'react';
import { Crown, Check, Loader2 } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { startCheckout } from '../services/stripe';
import { PRO_PRICE_DISPLAY } from '../constants/pricing';
import Toast, { useToast } from './ui/Toast';

export default function UpgradeModal({ isOpen, onClose, featureName }) {
  const { activeBusinessId } = useBusiness();
  const { toast, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const features = [
    'Invoicing & invoice history',
    'Expenses tracking',
    'Supplier management',
    'Staff & roles',
    'Branch management',
    'Sales analytics',
    'Audit log & data export',
    'Multiple themes',
    'And more'
  ];

  const handleUpgradeClick = async () => {
    setLoading(true);
    try {
      await startCheckout(activeBusinessId);
      // User is redirected to Stripe — this line won't execute
    } catch (err) {
      console.error('Checkout error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      <div 
        className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <div className="p-8 text-center relative">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center rotate-3 scale-110 shadow-lg shadow-amber-500/20">
            <Crown size={32} strokeWidth={2.5} />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading mb-2">
            This is a Pro Feature
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 px-4">
            <strong className="text-amber-600 dark:text-amber-400">{featureName}</strong> is available exclusively on the Pro plan.
          </p>

          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-5 mb-8 text-left">
            <p className="text-sm font-bold text-gray-800 dark:text-white mb-3">Upgrade to Pro to unlock:</p>
            <ul className="space-y-2.5">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <Check size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Price display */}
          <div className="mb-6">
            <p className="text-2xl font-bold text-gray-900 dark:text-white font-heading">{PRO_PRICE_DISPLAY}</p>
            <p className="text-xs text-gray-400 mt-1">Cancel anytime</p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleUpgradeClick}
              disabled={loading}
              className="w-full h-12 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                'Upgrade to Pro'
              )}
            </button>
            <button 
              onClick={onClose}
              disabled={loading}
              className="w-full h-12 bg-transparent text-gray-500 dark:text-gray-400 font-bold hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-6">
            Secure payment powered by Stripe. Already on Pro? Contact support if you're seeing this by mistake.
          </p>
        </div>
      </div>
    </div>
  );
}
