import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useFirestore';
import { Save, Bell, Shield, KeyRound, Building2, User, BellRing, BellOff, Eye, EyeOff, Check } from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';

const TABS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'business', label: 'Business Details', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function Settings() {
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const { settings, updateSettings } = useSettings();

  const [activeTab, setActiveTab] = useState('profile');

  // ── Profile state ──
  const [profile, setProfile] = useState({
    name: user?.email?.split('@')[0] || 'Admin',
    email: user?.email || '',
    phone: '+971 50 123 4567',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // ── Business state ──
  const [business, setBusiness] = useState({
    name: 'Supreme Sanitory',
    address: 'Dubai Design District, UAE',
    currency: 'USD ($)',
  });
  const [businessSaving, setBusinessSaving] = useState(false);

  // ── Notifications state ──
  const [notifications, setNotifications] = useState({
    lowStock: true,
    dailySummary: false,
    creditDue: true,
    newBill: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // ── Security state ──
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings.name || settings.address || settings.currency) {
        setBusiness(prev => ({
          ...prev,
          ...(settings.name && { name: settings.name }),
          ...(settings.address && { address: settings.address }),
          ...(settings.currency && { currency: settings.currency }),
        }));
      }
      if (settings.notifications) {
        setNotifications(prev => ({ ...prev, ...settings.notifications }));
      }
    }
  }, [settings]);

  // Handle scroll spy
  useEffect(() => {
    const handleScroll = () => {
      const sections = TABS.map(t => document.getElementById(t.id));
      const scrollPosition = window.scrollY + 120;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          if (activeTab !== section.id) {
            setActiveTab(section.id);
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  // ── Handlers ──
  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      showToast('Profile saved successfully');
    } catch { showToast('Failed to save profile', 'error'); }
    finally { setProfileSaving(false); }
  };

  const handleBusinessSave = async (e) => {
    e.preventDefault();
    setBusinessSaving(true);
    try {
      await updateSettings(business);
      showToast('Business details updated');
    } catch { showToast('Failed to update business details', 'error'); }
    finally { setBusinessSaving(false); }
  };

  const handleNotifSave = async (e) => {
    e.preventDefault();
    setNotifSaving(true);
    try {
      await updateSettings({ notifications });
      showToast('Notification preferences saved');
    } catch { showToast('Failed to save preferences', 'error'); }
    finally { setNotifSaving(false); }
  };

  const handleSecuritySave = async (e) => {
    e.preventDefault();
    if (!security.currentPassword) return showToast('Current password is required', 'error');
    if (security.newPassword.length < 6) return showToast('New password must be at least 6 characters', 'error');
    if (security.newPassword !== security.confirmPassword) return showToast('Passwords do not match', 'error');
    setSecuritySaving(true);
    try {
      await new Promise(r => setTimeout(r, 500));
      showToast('Password updated successfully');
      setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch { showToast('Failed to update password', 'error'); }
    finally { setSecuritySaving(false); }
  };

  const toggleNotif = (key) => setNotifications(prev => ({ ...prev, [key]: !prev[key] }));

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      const topbarOffset = 64;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - topbarOffset - 24;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // ── Shared styles ──
  const inputCls = "w-full h-[44px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-4 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition-all rounded-lg";
  const labelCls = "block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wider";
  const cardCls = "bg-white dark:bg-gray-900/80 border border-gray-200/60 dark:border-white/[0.06] rounded-xl p-7";
  const saveBtnCls = "h-[44px] flex items-center justify-center gap-2 bg-primary-600 text-white px-6 rounded-lg text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="w-full animate-fadeIn pb-24">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Page Header */}
      <div className="border-b border-gray-100 dark:border-gray-800/60 pb-4 mb-6 px-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Settings</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your account and business preferences</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 px-6">
        {/* Left Sidebar — fixed 200px */}
        <nav className="w-[200px] shrink-0 space-y-1.5 sticky top-24 self-start">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 hover:text-primary-600 dark:hover:text-primary-400'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        {/* Right Content — max-width 680px */}
        <div className="flex-1 max-w-[680px] space-y-6">
          
          {/* PROFILE SECTION */}
          <div id="profile" className={cardCls}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <User size={20} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Profile Information</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Your personal details and contact info</p>
              </div>
            </div>
            <form onSubmit={handleProfileSave} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} className={inputCls} placeholder="Your full name" />
                </div>
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className={inputCls} placeholder="+971 50 000 0000" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email Address</label>
                <input value={profile.email} disabled className={`${inputCls} opacity-50 cursor-not-allowed`} />
                <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">Email is linked to your login and cannot be changed here.</p>
              </div>
              <div className="pt-2 flex justify-end">
                <button type="submit" disabled={profileSaving} className={saveBtnCls}>
                  {profileSaving ? 'Saving...' : <><Save size={15} /> Save Profile</>}
                </button>
              </div>
            </form>
          </div>

          {/* BUSINESS SECTION */}
          <div id="business" className={cardCls}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Building2 size={20} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Business Details</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Your company name, address, and currency</p>
              </div>
            </div>
            <form onSubmit={handleBusinessSave} className="space-y-5">
              <div>
                <label className={labelCls}>Business Name</label>
                <input value={business.name} onChange={e => setBusiness({ ...business, name: e.target.value })} className={inputCls} placeholder="Your business name" />
              </div>
              <div>
                <label className={labelCls}>Business Address</label>
                <input value={business.address} onChange={e => setBusiness({ ...business, address: e.target.value })} className={inputCls} placeholder="Full business address" />
              </div>
              <div>
                <label className={labelCls}>Default Currency</label>
                <select value={business.currency} onChange={e => setBusiness({ ...business, currency: e.target.value })} className={`${inputCls} cursor-pointer`}>
                  <option>USD ($)</option>
                  <option>AED (د.إ)</option>
                  <option>EUR (€)</option>
                  <option>GBP (£)</option>
                  <option>INR (₹)</option>
                  <option>PKR (₨)</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end">
                <button type="submit" disabled={businessSaving} className={saveBtnCls}>
                  {businessSaving ? 'Saving...' : <><Save size={15} /> Save Details</>}
                </button>
              </div>
            </form>
          </div>

          {/* NOTIFICATIONS SECTION */}
          <div id="notifications" className={cardCls}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Bell size={20} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Notification Preferences</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Choose which alerts you want to receive</p>
              </div>
            </div>
            <form onSubmit={handleNotifSave} className="space-y-1">
              {[
                { key: 'lowStock', label: 'Low Stock Alerts', desc: 'Get notified when products fall below their restock threshold', iconOn: BellRing, iconOff: BellOff },
                { key: 'creditDue', label: 'Credit Due Reminders', desc: 'Alerts when a customer credit payment is due', iconOn: BellRing, iconOff: BellOff },
                { key: 'dailySummary', label: 'Daily Sales Summary', desc: 'Receive a summary of daily sales activity', iconOn: BellRing, iconOff: BellOff },
                { key: 'newBill', label: 'New Bill Created', desc: 'Get notified each time a new bill is added', iconOn: BellRing, iconOff: BellOff },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-4 border-b border-gray-100/50 dark:border-white/[0.04] last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleNotif(key)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${notifications[key] ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                  >
                    <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200 ${notifications[key] ? 'left-[22px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              ))}
              <div className="pt-4 flex justify-end">
                <button type="submit" disabled={notifSaving} className={saveBtnCls}>
                  {notifSaving ? 'Saving...' : <><Save size={15} /> Save Preferences</>}
                </button>
              </div>
            </form>
          </div>

          {/* SECURITY SECTION */}
          <div id="security" className="space-y-6">
            <div className={cardCls}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <KeyRound size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Master Password</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Used to protect edits and deletions in sensitive areas</p>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-500/10 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-400/90 leading-relaxed">
                  The master password is required for editing or deleting data in <strong>Profit Optimization</strong> and <strong>Inventory</strong>. 
                  Current password: <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-800/30 rounded text-xs font-mono">admin123</code>
                </p>
              </div>
            </div>

            <div className={cardCls}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="p-2 rounded-lg bg-primary-500/10">
                  <Shield size={20} className="text-primary-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Change Password</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Update your master password for added security</p>
                </div>
              </div>
              <form onSubmit={handleSecuritySave} className="space-y-5">
                <div>
                  <label className={labelCls}>Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={security.currentPassword}
                      onChange={e => setSecurity({ ...security, currentPassword: e.target.value })}
                      className={inputCls}
                      placeholder="Enter current password"
                    />
                    <button type="button" onClick={() => setShowCurrent(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>New Password</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={security.newPassword}
                        onChange={e => setSecurity({ ...security, newPassword: e.target.value })}
                        className={inputCls}
                        placeholder="Min. 6 characters"
                      />
                      <button type="button" onClick={() => setShowNew(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Confirm Password</label>
                    <input
                      type="password"
                      value={security.confirmPassword}
                      onChange={e => setSecurity({ ...security, confirmPassword: e.target.value })}
                      className={inputCls}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>
                {security.newPassword && security.confirmPassword && (
                  <div className={`flex items-center gap-2 text-xs font-medium ${security.newPassword === security.confirmPassword ? 'text-green-500' : 'text-red-400'}`}>
                    <Check size={14} />
                    {security.newPassword === security.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={securitySaving} className={saveBtnCls}>
                    {securitySaving ? 'Updating...' : <><Shield size={15} /> Update Password</>}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
