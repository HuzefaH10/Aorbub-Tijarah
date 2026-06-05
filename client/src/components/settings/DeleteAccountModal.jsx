import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useRole } from '../../hooks/useRole';
import { writeAuditLog } from '../../hooks/useAuditLog';
import { db, auth } from '../../services/firebase';
import {
  collection, query, where, getDocs, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, X, Mail, Lock, Eye, EyeOff } from 'lucide-react';

// ─────────────────────────────────────────────
// All Firestore root-level collections the app uses
// Each entry: { name, field } where field is the ownership key
// ─────────────────────────────────────────────
const DELETABLE_COLLECTIONS = [
  { name: 'bills',        field: 'businessId' },
  { name: 'products',     field: 'businessId' },
  { name: 'categories',   field: 'businessId' },
  { name: 'events',       field: 'businessId' },
  { name: 'expenses',     field: 'businessId' },
  { name: 'templates',    field: 'businessId' },
  { name: 'stockHistory', field: 'businessId' },
  { name: 'teamMembers',  field: 'businessId' },
  { name: 'invites',      field: 'businessId' },
  { name: 'auditLog',     field: 'businessId' },
  { name: 'milestones',   field: 'userId' },
  { name: 'stockLogs',    field: 'userId' },
  { name: 'entries',      field: 'userId' },
  { name: 'loginHistory', field: 'uid' },
];

// Human-readable error messages
const ERROR_MAP = {
  'auth/requires-recent-login': '__REAUTH__',
  'auth/wrong-password':        'Incorrect password. Please try again.',
  'auth/invalid-credential':    'Incorrect password. Please try again.',
  'auth/too-many-requests':     'Too many attempts. Please wait a few minutes.',
  'permission-denied':          'Unable to delete some data. Please contact support.',
};

function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again or contact support.';
  const code = err.code || '';
  if (ERROR_MAP[code]) return ERROR_MAP[code];
  if (code.includes('permission-denied')) return ERROR_MAP['permission-denied'];
  if (err.message?.includes('network') || err.message?.includes('Network') || code.includes('network'))
    return 'Connection lost. Please check your internet and try again.';
  return 'Something went wrong. Please try again or contact support.';
}

// ─────────────────────────────────────────────
// DeleteAccountModal
// ─────────────────────────────────────────────
export default function DeleteAccountModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { businesses, activeBusinessId } = useBusiness();
  const { role } = useRole();
  const navigate = useNavigate();

  // UI state
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Re-auth state
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthEmail, setReauthEmail] = useState('');
  const [showReauthPassword, setShowReauthPassword] = useState(false);
  const [reauthLoading, setReauthLoading] = useState(false);

  const isDeleteEnabled = confirmText === 'DELETE';
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setError('');
      setNeedsReauth(false);
      setReauthPassword('');
      setReauthEmail(user?.email || '');
      setDeleting(false);
      setReauthLoading(false);
    }
  }, [isOpen, user?.email]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape' && !deleting) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, deleting, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Re-authentication ──
  const handleReauthEmail = useCallback(async () => {
    if (!reauthPassword) return setError('Please enter your password.');
    setReauthLoading(true);
    setError('');
    try {
      const credential = EmailAuthProvider.credential(reauthEmail || user.email, reauthPassword);
      await reauthenticateWithCredential(user, credential);
      setNeedsReauth(false);
      // Proceed with deletion after successful re-auth
      await executeAccountDeletion();
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
    } finally {
      setReauthLoading(false);
    }
  }, [reauthPassword, reauthEmail, user]);

  const handleReauthGoogle = useCallback(async () => {
    setReauthLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(user, provider);
      setNeedsReauth(false);
      await executeAccountDeletion();
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
    } finally {
      setReauthLoading(false);
    }
  }, [user]);

  // ── Batch-delete a collection's docs matching a field ──
  const deleteCollectionDocs = useCallback(async (colName, field, ownerIds) => {
    for (const ownerId of ownerIds) {
      const q = query(collection(db, colName), where(field, '==', ownerId));
      const snap = await getDocs(q);
      if (snap.empty) continue;

      // Delete in batches of 400 (Firestore limit is 500)
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
  }, []);

  // ── Core deletion logic ──
  const executeAccountDeletion = useCallback(async () => {
    if (!user) return;
    setDeleting(true);
    setError('');

    try {
      // Gather all businessIds owned by this user
      const businessIds = businesses.map(b => b.id).filter(Boolean);
      if (!businessIds.includes(user.uid)) businessIds.push(user.uid);
      const ownerIds = [...new Set(businessIds)];

      // STEP 0 — Best-effort audit log
      try {
        await writeAuditLog(
          user,
          role,
          'ACCOUNT_DELETION_INITIATED',
          `Account deletion initiated. Affected businesses: ${ownerIds.join(', ')}`,
          null,
          activeBusinessId
        );
      } catch (_) { /* best-effort — continue regardless */ }

      // STEP 1 — Delete all collection documents
      for (const col of DELETABLE_COLLECTIONS) {
        try {
          // Some collections use userId/uid, others businessId
          // We try with all ownerIds regardless of field name
          await deleteCollectionDocs(col.name, col.field, ownerIds);
        } catch (err) {
          console.error(`Failed to delete ${col.name}:`, err);
          // If permission-denied, surface it but continue
          if (err.code?.includes('permission-denied')) {
            setError('Unable to delete some data. Please contact support.');
          }
        }
      }

      // STEP 2 — Delete business documents
      for (const bizId of ownerIds) {
        try {
          await deleteDoc(doc(db, 'businesses', bizId));
        } catch (err) {
          console.error(`Failed to delete business ${bizId}:`, err);
        }
      }

      // STEP 3 — Delete user document
      try {
        await deleteDoc(doc(db, 'users', user.uid));
      } catch (err) {
        console.error('Failed to delete user doc:', err);
      }

      // STEP 4 — Delete Firebase Auth account
      try {
        await user.delete();
      } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
          setNeedsReauth(true);
          setDeleting(false);
          return; // Will resume after re-auth
        }
        // Data is already gone — log but proceed
        console.error('Failed to delete auth account:', err);
      }

      // STEP 5 — Post-deletion cleanup
      try { await logout(); } catch (_) { /* ignore */ }
      
      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();

      // Set the deletion banner flag
      sessionStorage.setItem('account_deleted', 'true');

      // Redirect to login
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Account deletion failed:', err);
      const msg = friendlyError(err);
      if (msg === '__REAUTH__') {
        setNeedsReauth(true);
      } else {
        setError(msg);
      }
      setDeleting(false);
    }
  }, [user, businesses, role, activeBusinessId, deleteCollectionDocs, logout, navigate]);

  // ── Initiate deletion (called from confirm button) ──
  const handleConfirmDelete = useCallback(async () => {
    if (!isDeleteEnabled || deleting) return;
    setDeleting(true);
    setError('');

    try {
      // Attempt a proactive re-auth check first
      // For email/password users, we'll try deletion directly and catch requires-recent-login
      await executeAccountDeletion();
    } catch (err) {
      const msg = friendlyError(err);
      if (msg === '__REAUTH__') {
        setNeedsReauth(true);
        setDeleting(false);
      } else {
        setError(msg);
        setDeleting(false);
      }
    }
  }, [isDeleteEnabled, deleting, executeAccountDeletion]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        style={{ animation: 'deleteModalFadeIn 0.25s ease' }}
        onClick={!deleting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div
          className="relative w-full max-w-[520px] my-auto rounded-2xl border border-red-500/20 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(26, 0, 48, 0.97) 0%, rgba(13, 0, 24, 0.97) 100%)',
            animation: 'deleteModalSlideUp 0.3s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          {!deleting && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          )}

          <div className="p-8">
            {/* Warning Icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
            </div>

            {/* Heading */}
            <h2 className="text-2xl font-bold text-white text-center font-heading mb-3">
              Are you absolutely sure?
            </h2>

            {/* Body text */}
            <div className="text-sm text-gray-400 leading-relaxed mb-6 space-y-3">
              <p>This will permanently delete:</p>
              <ul className="space-y-1.5 ml-1">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>Your account and login credentials</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>All businesses and branches under your account</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>All products, inventory, sales records, expenses, and supplier data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>All staff accounts linked to your businesses</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>All audit logs, settings, and preferences</span>
                </li>
              </ul>
              <p className="text-red-400 font-bold text-xs uppercase tracking-wider pt-1">
                This CANNOT be undone. There is no recovery.
              </p>
            </div>

            {/* Re-authentication prompt (shown when needed) */}
            {needsReauth && (
              <div className="mb-6 p-5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                  <Lock size={14} />
                  Identity verification required
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Your session has expired. Please re-authenticate to proceed.
                </p>

                {isGoogleUser ? (
                  <button
                    onClick={handleReauthGoogle}
                    disabled={reauthLoading}
                    className="w-full h-[44px] flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reauthLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Re-authenticate with Google
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input
                          type="email"
                          value={reauthEmail}
                          onChange={e => setReauthEmail(e.target.value)}
                          className="w-full h-[40px] bg-gray-900/60 border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 outline-none focus:border-amber-500/50 transition-all"
                          placeholder="Your email"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input
                          type={showReauthPassword ? 'text' : 'password'}
                          value={reauthPassword}
                          onChange={e => setReauthPassword(e.target.value)}
                          className="w-full h-[40px] bg-gray-900/60 border border-white/10 text-white text-sm rounded-lg pl-9 pr-10 outline-none focus:border-amber-500/50 transition-all"
                          placeholder="Enter password"
                          onKeyDown={e => { if (e.key === 'Enter') handleReauthEmail(); }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowReauthPassword(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                        >
                          {showReauthPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleReauthEmail}
                      disabled={reauthLoading || !reauthPassword}
                      className="w-full h-[40px] flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reauthLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        'Verify Identity'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Confirmation input (hidden during re-auth flow) */}
            {!needsReauth && (
              <div className="mb-6">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Type &quot;DELETE&quot; to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => { setConfirmText(e.target.value); setError(''); }}
                  disabled={deleting}
                  placeholder='Type "DELETE" to confirm'
                  className={`w-full h-[48px] bg-gray-900/60 border text-white text-sm rounded-xl px-4 outline-none transition-all placeholder:text-gray-700 font-mono tracking-widest ${
                    isDeleteEnabled
                      ? 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.15)] focus:border-red-500'
                      : 'border-white/10 focus:border-white/20'
                  }`}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}

            {/* Buttons */}
            {!needsReauth && (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={deleting}
                  className="flex-1 h-[48px] rounded-xl border border-white/10 text-gray-400 text-sm font-bold hover:bg-white/5 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={!isDeleteEnabled || deleting}
                  className={`flex-1 h-[48px] rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    isDeleteEnabled && !deleting
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {deleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    'Permanently Delete Account'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scoped animations */}
      <style>{`
        @keyframes deleteModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes deleteModalSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
