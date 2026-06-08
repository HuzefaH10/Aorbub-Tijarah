import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../hooks/useRole';
import { useBusiness } from '../../context/BusinessContext';
import { db } from '../../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  ChevronDown, Settings, HelpCircle, LogOut, Keyboard, Sparkles, X,
  Crown, ShieldCheck, UserCog, Building2, Plus, CheckCircle2
} from 'lucide-react';
import StockAlertBell from './StockAlertBell';
import Toast, { useToast } from '../ui/Toast';

const titles = {
  '/': 'Dashboard',
  '/analytics': 'Sales Analytics',
  '/profit': 'Profit Optimization',
  '/inventory': 'Inventory Management',
  '/calendar': 'Calendar & Scheduling',
  '/settings': 'Settings',
  '/help': 'Help & Contact',
  '/data-entry': 'Stock Entry'
};

const ROLE_CONFIG = {
  owner: { label: 'Owner', color: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400', icon: Crown },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400', icon: ShieldCheck },
  staff: { label: 'Staff', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: UserCog },
};

const STATUS_CONFIG = {
  online: { color: 'bg-green-500', label: 'Online' },
  away:   { color: 'bg-amber-500', label: 'Away' },
  busy:   { color: 'bg-red-500',   label: 'Busy' },
};

const KEYBOARD_SHORTCUTS = [
  { action: 'Go to Stock Entry', keys: 'G then S' },
  { action: 'Go to Inventory',   keys: 'G then I' },
  { action: 'Go to Analytics',   keys: 'G then A' },
  { action: 'Go to Calendar',    keys: 'G then C' },
  { action: 'Go to Settings',    keys: 'G then P' },
  { action: 'New Bill',           keys: 'N then B' },
  { action: 'Search',             keys: 'Ctrl + K' },
  { action: 'Close modal',        keys: 'Esc' },
];

const CHANGELOG = [
  {
    version: 'v1.3',
    date: '9 May 2026',
    badge: 'New Feature',
    badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400',
    changes: [
      'Audit Log for tracking all business actions',
      'Data & Privacy tab with Export and Backup/Restore',
      'Profile enhancements — Display Name, Bio, Role Badge, Last Login',
      'Keyboard shortcuts for quick navigation',
    ],
  },
  {
    version: 'v1.2',
    date: '8 May 2026',
    badge: 'Improvement',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    changes: [
      'Appearance tab with 3 theme options (Royal Purple, Light, Gold & Black)',
      'Business Hours management with 7-day grid',
      'Team & Access with role-based permissions (Owner/Admin/Staff)',
      'Security section with password management and session info',
    ],
  },
  {
    version: 'v1.1',
    date: '7 May 2026',
    badge: 'New Feature',
    badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400',
    changes: [
      'Settings page with modern scroll-spy layout',
      'Profile and Business Details management',
      'Notification preferences',
    ],
  },
  {
    version: 'v1.0',
    date: '3 May 2026',
    badge: 'Initial Release',
    badgeColor: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    changes: [
      'Dashboard with sales overview and analytics',
      'Inventory management with categories',
      'Stock entry and billing system',
      'Calendar with events and milestones',
      'Profit Optimization engine',
    ],
  },
];

// Latest changelog date for unread detection
const LATEST_CHANGELOG_DATE = new Date('2026-05-09T00:00:00').getTime();

export default function Topbar() {
  const { user, logout } = useAuth();
  const { role } = useRole();
  const { activeBusinessId, activeBusiness, businesses, switchBusiness, createBusiness, userProfile } = useBusiness();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [statusPicker, setStatusPicker] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [bizSwitcherOpen, setBizSwitcherOpen] = useState(false);
  const [newBizModal, setNewBizModal] = useState(false);
  const [newBiz, setNewBiz] = useState({ name: '', address: '', currency: 'USD' });
  const [creatingBiz, setCreatingBiz] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const timerRef = useRef();

  // Fetch changelog read state
  useEffect(() => {
    if (!userProfile) return;
    const lastSeen = userProfile.lastSeenChangelog?.toDate?.()?.getTime?.() || 0;
    setHasUnread(lastSeen < LATEST_CHANGELOG_DATE);
  }, [userProfile]);

  // Derived profile data
  const profileData = {
    displayName: userProfile?.displayName || userProfile?.fullName || user?.email?.split('@')[0] || 'Admin',
    fullName: userProfile?.fullName || userProfile?.displayName || '',
    photoURL: userProfile?.photoURL || '',
    status: userProfile?.status || 'online',
  };

  // Status update
  const setStatus = async (newStatus) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { status: newStatus }, { merge: true });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Mark changelog as read
  const openChangelog = async () => {
    setChangelogOpen(true);
    setOpen(false);
    setHasUnread(false);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { lastSeenChangelog: serverTimestamp() }, { merge: true });
      } catch (err) {
        console.error('Failed to mark changelog as read:', err);
      }
    }
  };

  const enter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const leave = () => { timerRef.current = setTimeout(() => setOpen(false), 200); };

  const handleSwitchBusiness = async (biz) => {
    if (biz.id === activeBusinessId) { setBizSwitcherOpen(false); return; }
    try {
      await switchBusiness(biz.id, biz.name);
      showToast(`Switched to ${biz.name}`);
      setBizSwitcherOpen(false);
      setOpen(false);
    } catch { showToast('Failed to switch business', 'error'); }
  };

  const handleCreateBusiness = async () => {
    if (!newBiz.name.trim()) return;
    setCreatingBiz(true);
    try {
      await createBusiness({ name: newBiz.name.trim(), address: newBiz.address.trim(), currency: newBiz.currency });
      showToast(`Created & switched to ${newBiz.name.trim()}`);
      setNewBizModal(false);
      setNewBiz({ name: '', address: '', currency: 'USD' });
      setBizSwitcherOpen(false);
      setOpen(false);
    } catch { showToast('Failed to create business', 'error'); }
    finally { setCreatingBiz(false); }
  };

  const today = new Date().toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const title = titles[location.pathname] || 'Dashboard';

  const handleLogout = async () => {
    try { await logout(); }
    catch (err) { console.error(err); }
  };

  const navTo = (path) => {
    navigate(path);
    setOpen(false);
  };

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    let gPressed = false;
    let nPressed = false;
    let gTimer = null;
    let nTimer = null;

    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

      // Ctrl+K → Search (placeholder for now)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        return;
      }

      // Esc → close modals
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setChangelogOpen(false);
        setOpen(false);
        return;
      }

      const key = e.key.toLowerCase();

      // G-prefixed shortcuts
      if (key === 'g' && !gPressed && !nPressed) {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 1000);
        return;
      }

      if (gPressed) {
        gPressed = false;
        clearTimeout(gTimer);
        if (key === 's') { navigate('/data-entry'); return; }
        if (key === 'i') { navigate('/inventory'); return; }
        if (key === 'a') { navigate('/analytics'); return; }
        if (key === 'c') { navigate('/calendar'); return; }
        if (key === 'p') { navigate('/settings'); return; }
      }

      // N-prefixed shortcuts
      if (key === 'n' && !nPressed && !gPressed) {
        nPressed = true;
        clearTimeout(nTimer);
        nTimer = setTimeout(() => { nPressed = false; }, 1000);
        return;
      }

      if (nPressed) {
        nPressed = false;
        clearTimeout(nTimer);
        if (key === 'b') { navigate('/data-entry'); return; }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(gTimer);
      clearTimeout(nTimer);
    };
  }, [navigate]);

  const roleCfg = ROLE_CONFIG[role] || ROLE_CONFIG.owner;
  const RoleIcon = roleCfg.icon;
  const statusCfg = STATUS_CONFIG[profileData.status] || STATUS_CONFIG.online;

  return (
    <>
      <header className="h-16 glass !rounded-none !border-t-0 !border-x-0 flex items-center justify-between px-6 fixed top-0 left-[64px] right-0 z-50 transition-colors duration-300">
        <div>
          {location.pathname !== '/data-entry' && (
            <>
              <h1 className="text-lg font-bold text-gray-800 dark:text-white font-heading">{title}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Last updated: {today}</p>
            </>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <StockAlertBell />

          {/* Account dropdown */}
          <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
            <button className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full pl-1.5 pr-3.5 py-1.5 transition-colors border border-gray-100 dark:border-gray-700">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center overflow-hidden">
                  {profileData.photoURL
                    ? <img src={profileData.photoURL} alt="" className="w-full h-full object-cover" />
                    : (profileData.displayName?.charAt(0) || user?.email?.charAt(0) || 'A').toUpperCase()
                  }
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px] rounded-full border-2 border-white dark:border-gray-800 ${statusCfg.color}`} />
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium max-w-[120px] truncate">
                {profileData.displayName || user?.email?.split('@')[0] || 'Admin'}
              </span>
              <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-72 glass-opaque overflow-clip animate-fadeIn origin-top-right">
                {/* Profile header with avatar + name + email + role */}
                <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                  <div className="flex items-start gap-3">
                    {/* Avatar with status dot & picker */}
                    <div className="relative shrink-0">
                      <div
                        className="w-10 h-10 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center overflow-hidden cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setStatusPicker(!statusPicker); }}
                      >
                        {profileData.photoURL
                          ? <img src={profileData.photoURL} alt="" className="w-full h-full object-cover" />
                          : (profileData.displayName?.charAt(0) || 'A').toUpperCase()
                        }
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px] rounded-full border-2 border-white dark:border-gray-800 ${statusCfg.color} cursor-pointer`}
                        onClick={(e) => { e.stopPropagation(); setStatusPicker(!statusPicker); }}
                      />
                      {/* Inline status picker */}
                      {statusPicker && (
                        <div className="absolute top-full left-0 mt-1.5 w-[110px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5 z-50 animate-fadeIn">
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <button
                              key={key}
                              onClick={(e) => { e.stopPropagation(); setStatus(key); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${profileData.status === key ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-300'}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-white font-semibold truncate">
                        {profileData.displayName || profileData.fullName || user?.email?.split('@')[0] || 'Admin'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{user?.email || 'admin@aorbub.com'}</p>
                      <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${roleCfg.color}`}>
                        <RoleIcon size={10} />
                        {roleCfg.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Switch Business section */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-wider">Current Business</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setBizSwitcherOpen(p => !p); }}
                      className="text-[10px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {bizSwitcherOpen ? 'Close' : 'Switch'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-primary-500 shrink-0" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                      {activeBusiness?.name || 'My Business'}
                    </span>
                  </div>

                  {bizSwitcherOpen && (
                    <div className="mt-3 space-y-1 max-h-[160px] overflow-y-auto">
                      {businesses.map(biz => (
                        <button
                          key={biz.id}
                          onClick={(e) => { e.stopPropagation(); handleSwitchBusiness(biz); }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                            biz.id === activeBusinessId
                              ? 'bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/30'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{biz.name}</p>
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                              ROLE_CONFIG[biz.role]?.color || 'bg-gray-100 text-gray-500'
                            }`}>
                              {biz.role || 'owner'}
                            </span>
                          </div>
                          {biz.id === activeBusinessId && (
                            <CheckCircle2 size={14} className="text-primary-500 shrink-0" />
                          )}
                        </button>
                      ))}

                      {/* Add New Business */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setNewBizModal(true); setOpen(false); setBizSwitcherOpen(false); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 border border-dashed border-primary-300 dark:border-primary-500/30 transition-colors mt-1"
                      >
                        <Plus size={12} /> Add New Business
                      </button>
                    </div>
                  )}
                </div>

                {/* Menu items */}
                <div className="py-1.5">
                  <button onClick={() => navTo('/settings')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Settings size={16} /> Settings
                  </button>
                  <button onClick={openChangelog} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                    <Sparkles size={16} /> What's New
                    {hasUnread && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse ml-auto" />
                    )}
                  </button>
                  <button onClick={() => { setShortcutsOpen(true); setOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Keyboard size={16} /> Keyboard Shortcuts
                  </button>
                  <button onClick={() => navTo('/help')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <HelpCircle size={16} /> Help & Contact
                  </button>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 py-1.5">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Keyboard Shortcuts Modal ── */}
      {shortcutsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] animate-fadeIn" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Keyboard size={20} className="text-primary-500" />
                <h3 className="text-base font-bold text-gray-800 dark:text-white">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShortcutsOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                {KEYBOARD_SHORTCUTS.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{s.action}</span>
                    <kbd className="shrink-0 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] font-bold text-gray-500 dark:text-gray-400 font-mono shadow-sm">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── What's New Drawer ── */}
      {changelogOpen && (
        <div className="fixed inset-0 z-[200]" onClick={() => setChangelogOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" />

          {/* Side drawer */}
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-white/10 shadow-2xl flex flex-col animate-slideInRight"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <Sparkles size={20} className="text-primary-500" />
                <h3 className="text-base font-bold text-gray-800 dark:text-white">What's New</h3>
              </div>
              <button onClick={() => setChangelogOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {CHANGELOG.map((entry, i) => (
                <div key={i} className="relative pl-5">
                  {/* Timeline dot + line */}
                  <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-primary-100 dark:ring-primary-500/20" />
                  {i < CHANGELOG.length - 1 && (
                    <div className="absolute left-[4.5px] top-4 bottom-0 w-px bg-gray-200 dark:bg-gray-800" style={{ top: '16px', bottom: '-24px' }} />
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">{entry.version}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${entry.badgeColor}`}>
                      {entry.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 font-bold uppercase tracking-wider mb-2">{entry.date}</p>
                  <ul className="space-y-1.5">
                    {entry.changes.map((change, j) => (
                      <li key={j} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600 shrink-0 mt-1.5" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Slide-in animation for drawer */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>

      {/* ── Toast ── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* ── Create New Business Modal ── */}
      {newBizModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] animate-fadeIn p-4" onClick={() => setNewBizModal(false)}>
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Building2 size={20} className="text-primary-500" />
                <h3 className="text-base font-bold text-gray-800 dark:text-white">Create New Business</h3>
              </div>
              <button onClick={() => setNewBizModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Business Name *</label>
                <input
                  autoFocus
                  value={newBiz.name}
                  onChange={e => setNewBiz(p => ({ ...p, name: e.target.value }))}
                  className="w-full glass text-gray-800 dark:text-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 transition-all rounded-xl"
                  placeholder="e.g. Supreme Sanitory - Branch 2"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Business Address</label>
                <input
                  value={newBiz.address}
                  onChange={e => setNewBiz(p => ({ ...p, address: e.target.value }))}
                  className="w-full glass text-gray-800 dark:text-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 transition-all rounded-xl"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Default Currency</label>
                <select
                  value={newBiz.currency}
                  onChange={e => setNewBiz(p => ({ ...p, currency: e.target.value }))}
                  className="w-full glass text-gray-800 dark:text-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 transition-all rounded-xl cursor-pointer"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="PKR">PKR — Pakistani Rupee</option>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="SAR">SAR — Saudi Riyal</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewBizModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateBusiness}
                  disabled={!newBiz.name.trim() || creatingBiz}
                  className="flex-1 py-2.5 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingBiz ? 'Creating...' : 'Create & Switch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
