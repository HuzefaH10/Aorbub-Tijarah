import React, { useState, useEffect } from 'react';
import { usePlan } from '../../hooks/usePlan';
import { useBusiness } from '../../context/BusinessContext';
import { useRole } from '../../hooks/useRole';
import { Crown, Check, Receipt, Loader2, ExternalLink, Download, FlaskConical } from 'lucide-react';
import { fetchBillingHistory } from '../../services/stripe';
import { activateProNow, switchPlan } from '../../services/planUtils';
import { PRO_PRICE_DISPLAY } from '../../constants/pricing';
import Toast, { useToast } from '../ui/Toast';
import { useSearchParams } from 'react-router-dom';

export default function TabBillHistory({ cardCls }) {
  const { plan, isPro, isFree, isTrialActive, daysLeftInTrial, planActivatedAt, trialUsed } = usePlan();
  const { activeBusinessId, businessData } = useBusiness();
  const { isOwner } = useRole();
  const { toast, showToast, hideToast } = useToast();
  const [billingHistory, setBillingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [planToggling, setPlanToggling] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle return from Stripe
  useEffect(() => {
    const upgradeStatus = searchParams.get('upgrade');
    if (upgradeStatus === 'success') {
      showToast('🎉 Welcome to Pro! All features are now unlocked.', 'success');
      // Clean the URL
      searchParams.delete('upgrade');
      setSearchParams(searchParams, { replace: true });
    } else if (upgradeStatus === 'cancelled') {
      showToast("Upgrade cancelled. You're still on the Free plan.", 'warning');
      searchParams.delete('upgrade');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Fetch billing history from Stripe
  useEffect(() => {
    async function loadBilling() {
      if (!activeBusinessId) return;
      try {
        const invoices = await fetchBillingHistory(activeBusinessId);
        setBillingHistory(invoices);
      } catch (err) {
        console.error('Failed to fetch billing history:', err);
        // Silent fallback — empty list is fine
      } finally {
        setLoading(false);
      }
    }
    loadBilling();
  }, [activeBusinessId]);

  const handleUpgradeClick = async () => {
    setUpgradeLoading(true);
    try {
      await activateProNow(activeBusinessId);
      // BusinessContext onSnapshot fires within ~500ms and flips isPro → true
      showToast('🎉 Pro access activated! All features are now unlocked.', 'success');
    } catch (err) {
      console.error('Activation error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handlePlanToggle = async (targetPlan) => {
    setPlanToggling(true);
    try {
      await switchPlan(activeBusinessId, targetPlan);
      showToast(`Plan switched to ${targetPlan === 'pro' ? 'Pro' : 'Free'} successfully.`, 'success');
    } catch (err) {
      console.error('Plan toggle error:', err);
      showToast(err.message || 'Failed to switch plan.', 'error');
    } finally {
      setPlanToggling(false);
    }
  };

  const handleManageClick = () => {
    showToast('Contact support to manage your plan.');
  };

  const features = [
    { name: 'Stock Management', free: true, pro: true },
    { name: 'Daily P&L', free: true, pro: true },
    { name: 'Credits & Dues', free: true, pro: true },
    { name: 'Invoicing', free: false, pro: true },
    { name: 'Expenses Tracking', free: false, pro: true },
    { name: 'Supplier Management', free: false, pro: true },
    { name: 'Staff & Roles', free: false, pro: true },
    { name: 'Branch Management', free: false, pro: true },
    { name: 'Sales Analytics', free: false, pro: true },
    { name: 'Audit Log', free: false, pro: true },
    { name: 'Data Import/Export', free: false, pro: true },
    { name: 'Multiple Themes', free: false, pro: true },
  ];

  const planDate = planActivatedAt
    ? new Date(planActivatedAt.seconds ? planActivatedAt.seconds * 1000 : planActivatedAt).toLocaleDateString()
    : (businessData?.planActivatedAt?.seconds
        ? new Date(businessData.planActivatedAt.seconds * 1000).toLocaleDateString()
        : '');

  return (
    <div id="bills" className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      {/* Current Plan Card */}
      <div className={cardCls}>
        {isFree ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading mb-2">Free Plan</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You have access to Stock Management, Daily P&L, and Credits & Dues.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-2">
                {trialUsed 
                  ? 'Your trial has ended. Upgrade to restore full access.'
                  : 'Unlock invoicing, analytics, staff management and more.'}
              </p>
            </div>
            {isOwner && (
              <button 
                onClick={handleUpgradeClick}
                disabled={upgradeLoading}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-500/30 transition-all flex items-center gap-2"
              >
                {upgradeLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Upgrade to Pro'
                )}
              </button>
            )}
          </div>
        ) : isTrialActive ? (
          /* Trial-specific card */
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <Crown size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">Pro Trial</h2>
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold">
                      {daysLeftInTrial} day{daysLeftInTrial !== 1 ? 's' : ''} remaining
                    </p>
                  </div>
                </div>
                {planDate && (
                  <p className="text-xs text-gray-500 mt-1">Trial started {planDate}</p>
                )}
              </div>
              {isOwner && (
                <button 
                  onClick={handleUpgradeClick}
                  disabled={upgradeLoading}
                  className="shrink-0 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-500/30 transition-all flex items-center gap-2 hover:scale-105"
                >
                  {upgradeLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Loading...
                    </>
                  ) : (
                    daysLeftInTrial <= 3 ? '🔥 Upgrade Before It Expires' : 'Lock in Pro'
                  )}
                </button>
              )}
            </div>
            {/* Trial progress bar */}
            <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  daysLeftInTrial <= 3 ? 'bg-red-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, ((14 - (daysLeftInTrial || 0)) / 14) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Day {14 - (daysLeftInTrial || 0)}</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Day 14</span>
            </div>
          </div>
        ) : (
          /* Permanent Pro card */
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Crown size={24} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">Pro Plan</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Active — No expiry
              </p>
              {planDate && (
                <p className="text-xs text-gray-500 mt-1">Member since {planDate}</p>
              )}
            </div>
            {isOwner && (
              <button 
                onClick={handleManageClick}
                className="shrink-0 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                Manage Plan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Plan Comparison Table */}
      <div className={cardCls}>
        <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading mb-6">Plan Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10">
                <th className="py-3 px-4 font-bold text-gray-900 dark:text-white">Feature</th>
                <th className="py-3 px-4 font-bold text-gray-900 dark:text-white text-center">Free</th>
                <th className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400 text-center">
                  Pro — {PRO_PRICE_DISPLAY}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {features.map((f, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">{f.name}</td>
                  <td className="py-3 px-4 text-center">
                    {f.free ? <Check size={16} className="mx-auto text-gray-400" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {f.pro ? <Check size={16} className="mx-auto text-amber-500" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Billing History Table */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="p-2 rounded-lg bg-primary-500/10">
            <Receipt size={20} className="text-primary-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Billing History</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">View past payments and invoices</p>
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : billingHistory.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 dark:border-white/10 rounded-xl">
            <Receipt size={32} className="mx-auto mb-3 text-gray-400 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">No billing history yet.</p>
            {isFree && <p className="text-xs text-gray-400">Upgrade to Pro to get started.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/5">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {billingHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">
                      {record.date ? new Date(record.date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white capitalize">{record.planName || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{record.amount || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                        record.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        record.status === 'open' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {record.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {record.invoiceUrl && (
                          <a href={record.invoiceUrl} target="_blank" rel="noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-semibold flex items-center gap-1">
                            <ExternalLink size={12} /> View
                          </a>
                        )}
                        {record.invoicePdf && (
                          <a href={record.invoicePdf} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs font-semibold flex items-center gap-1">
                            <Download size={12} /> PDF
                          </a>
                        )}
                        {!record.invoiceUrl && !record.invoicePdf && (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade CTA Section (Free users and trial users, Owner only) */}
      {(isFree || isTrialActive) && isOwner && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Crown size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-bold text-white font-heading mb-2">
              {isTrialActive 
                ? `Lock in Pro before your trial ends in ${daysLeftInTrial} day${daysLeftInTrial !== 1 ? 's' : ''}.`
                : 'Ready to grow? Upgrade to Pro.'}
            </h3>
            <p className="text-gray-300 text-sm mb-6">
              {isTrialActive 
                ? 'Keep all your Pro features and data access permanently.'
                : 'One plan. Everything unlocked. Cancel anytime.'}
            </p>
            <div className="inline-block bg-white/10 rounded-xl px-4 py-2 mb-6 border border-white/20">
              <p className="text-white font-semibold text-sm">{PRO_PRICE_DISPLAY}</p>
            </div>
            <div>
              <button 
                onClick={handleUpgradeClick}
                disabled={upgradeLoading}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-bold py-3 px-8 rounded-xl shadow-xl shadow-amber-500/20 transition-all hover:scale-105 flex items-center gap-2 mx-auto"
              >
                {upgradeLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Get Pro'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEV PLAN TOGGLE (remove before production) ── */}
      <div className="border-2 border-dashed border-red-500/40 rounded-2xl p-6 bg-red-500/5">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical size={18} className="text-red-400" />
          <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
            ⚙️ Plan Testing
          </span>
          <span className="ml-auto text-[10px] font-bold text-red-400/60 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            Remove before production
          </span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Current plan: <span className={`font-bold ${plan === 'pro' ? 'text-amber-400' : 'text-gray-300'}`}>{plan}</span>
          {businessData?.planExpiresAt === null && plan === 'pro' && (
            <span className="ml-2 text-green-400 font-semibold">(permanent)</span>
          )}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handlePlanToggle('free')}
            disabled={planToggling || plan === 'free'}
            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {planToggling ? <Loader2 size={14} className="animate-spin" /> : null}
            Switch to Free
          </button>
          <button
            onClick={() => handlePlanToggle('pro')}
            disabled={planToggling || (plan === 'pro' && !businessData?.planExpiresAt)}
            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {planToggling ? <Loader2 size={14} className="animate-spin" /> : null}
            Switch to Pro
          </button>
        </div>
      </div>
    </div>
  );
}
