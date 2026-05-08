import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useFirestore';
import { useRole, useTeam } from '../hooks/useRole';
import { Save, Bell, Shield, KeyRound, Building2, User, BellRing, BellOff, Eye, EyeOff, Check, Camera, MonitorSmartphone, LogOut, Users, Send, X, Crown, ShieldCheck, UserCog } from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';
import { db, storage } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

const TABS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'business', label: 'Business Details', icon: Building2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

const ROLE_CONFIG = {
  owner: { label: 'Owner', color: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400', icon: Crown },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400', icon: ShieldCheck },
  staff: { label: 'Staff', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: UserCog },
};

const TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [
  'UTC', 'Asia/Dubai', 'Asia/Karachi', 'America/New_York', 'Europe/London'
];

// Helper to parse user agent
const parseUserAgent = (ua) => {
  let browser = "Unknown Browser";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  else if (ua.includes("Trident")) browser = "Internet Explorer";
  else if (ua.includes("Edge")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "MacOS";
  else if (ua.includes("X11")) os = "UNIX";
  else if (ua.includes("Linux")) os = "Linux";
  if (ua.includes("Android")) os = "Android";
  if (ua.includes("like Mac")) os = "iOS";

  return `${browser} on ${os}`;
};

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const { settings, updateSettings } = useSettings();
  const { role, hasPermission, isOwner } = useRole();
  const { members, invites, sendInvite, cancelInvite, removeMember } = useTeam();

  const [activeTab, setActiveTab] = useState('profile');

  // ── Team state ──
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviteSending, setInviteSending] = useState(false);

  // ── Profile state ──
  const [profile, setProfile] = useState({
    name: user?.email?.split('@')[0] || 'Admin',
    email: user?.email || '',
    phone: '+971 50 123 4567',
    photoURL: ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(prev => ({
            ...prev,
            name: data.displayName || prev.name,
            phone: data.phone || prev.phone,
            photoURL: data.photoURL || ''
          }));
          if (data.notificationPreferences) {
            setNotifications(prev => ({ ...prev, ...data.notificationPreferences }));
          }
        }
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }
    };
    fetchProfile();
  }, [user]);

  // ── Business state ──
  const [business, setBusiness] = useState({
    name: 'Supreme Sanitory',
    address: 'Dubai Design District, UAE',
    currency: 'USD ($)',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dubai',
    logoURL: ''
  });
  const [businessSaving, setBusinessSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchBusiness = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'businesses', user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBusiness(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load business details:', err);
      }
    };
    fetchBusiness();
  }, [user]);

  // ── Notifications state ──
  const [notifications, setNotifications] = useState({
    lowStock: true,
    outOfStock: true,
    creditDue: true,
    stockExpiry: true,
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
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) return showToast('File must be less than 2MB', 'error');
    if (!file.type.startsWith('image/')) return showToast('Must be an image', 'error');
    
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const storageRef = ref(storage, `profiles/${user.uid}_${Date.now()}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setProfile(p => ({ ...p, photoURL: url }));
      await setDoc(doc(db, 'users', user.uid), { photoURL: url }, { merge: true });
      showToast('Profile photo updated');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        displayName: profile.name,
        phone: profile.phone,
        photoURL: profile.photoURL
      }, { merge: true });
      showToast('Profile saved successfully');
    } catch { showToast('Failed to save profile', 'error'); }
    finally { setProfileSaving(false); }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 3 * 1024 * 1024) return showToast('File must be less than 3MB', 'error');
    if (!file.type.startsWith('image/')) return showToast('Must be an image', 'error');
    
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const storageRef = ref(storage, `logos/${user.uid}_${Date.now()}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setBusiness(p => ({ ...p, logoURL: url }));
      await setDoc(doc(db, 'businesses', user.uid), { logoURL: url }, { merge: true });
      showToast('Business logo updated');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBusinessSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setBusinessSaving(true);
    try {
      await setDoc(doc(db, 'businesses', user.uid), business, { merge: true });
      showToast('Business details updated');
    } catch { showToast('Failed to update business details', 'error'); }
    finally { setBusinessSaving(false); }
  };

  const handleNotifSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setNotifSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        notificationPreferences: notifications
      }, { merge: true });
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
      if (user && user.email) {
        const credential = EmailAuthProvider.credential(user.email, security.currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, security.newPassword);
        showToast('Password updated successfully');
        setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        showToast('Incorrect current password', 'error');
      } else {
        showToast('Failed to update password', 'error');
      }
    } finally { 
      setSecuritySaving(false); 
    }
  };

  const handleSignOutAll = async () => {
    try {
      await logout();
    } catch (err) {
      console.error(err);
      showToast('Failed to sign out', 'error');
    }
  };

  const getPasswordStrength = (pw) => {
    if (!pw) return { label: '', color: 'bg-gray-200 dark:bg-gray-700', width: 'w-0' };
    if (pw.length < 6) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' };
    if (pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
    return { label: 'Medium', color: 'bg-amber-500', width: 'w-2/3' };
  };

  const toggleNotif = (key) => setNotifications(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return showToast('Email is required', 'error');
    setInviteSending(true);
    try {
      await sendInvite(inviteEmail, inviteRole);
      showToast(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('staff');
    } catch (err) {
      showToast(err.message || 'Failed to send invite', 'error');
    } finally {
      setInviteSending(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Remove ${member.email} from this business?`)) return;
    try {
      await removeMember(member.id, member.uid);
      showToast(`${member.email} removed from team`);
    } catch (err) {
      showToast('Failed to remove member', 'error');
    }
  };

  const handleCancelInvite = async (invite) => {
    try {
      await cancelInvite(invite.id);
      showToast('Invite cancelled');
    } catch {
      showToast('Failed to cancel invite', 'error');
    }
  };

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
              {/* Photo Upload */}
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <div className="w-[80px] h-[80px] rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-gray-700 flex items-center justify-center shrink-0">
                    {profile.photoURL ? (
                      <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-gray-400 dark:text-gray-500">
                        {profile.name ? profile.name.charAt(0).toUpperCase() : 'A'}
                      </span>
                    )}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity">
                    <Camera size={20} />
                    <input type="file" accept="image/jpeg, image/png" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                  </label>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800 dark:text-white">Profile Photo</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">JPG or PNG. Max size 2MB.</p>
                </div>
              </div>

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
                <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">Email cannot be changed. Contact support if needed.</p>
              </div>
              <div className="pt-2 flex justify-end">
                <button type="submit" disabled={profileSaving || uploadingPhoto} className={saveBtnCls}>
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
              {/* Logo Upload */}
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <div className="w-[160px] h-[60px] rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900/50 border-2 border-dashed border-gray-200 dark:border-white/10 flex items-center justify-center shrink-0 transition-colors group-hover:border-primary-500">
                    {business.logoURL ? (
                      <img src={business.logoURL} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                        <Camera size={16} className="mb-1" />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Upload Logo</span>
                      </div>
                    )}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-lg cursor-pointer transition-opacity">
                    <span className="text-xs font-semibold">Change Logo</span>
                    <input type="file" accept="image/jpeg, image/png, image/svg+xml" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                  {uploadingLogo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800 dark:text-white">Business Logo</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Appears on invoices. JPG, PNG, SVG (Max 3MB).</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Business Name</label>
                  <input value={business.name} onChange={e => setBusiness({ ...business, name: e.target.value })} className={inputCls} placeholder="Your business name" />
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
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Business Address</label>
                  <input value={business.address} onChange={e => setBusiness({ ...business, address: e.target.value })} className={inputCls} placeholder="Full business address" />
                </div>
                <div>
                  <label className={labelCls}>Timezone</label>
                  <select value={business.timezone} onChange={e => setBusiness({ ...business, timezone: e.target.value })} className={`${inputCls} cursor-pointer`}>
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button type="submit" disabled={businessSaving || uploadingLogo} className={saveBtnCls}>
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
                { key: 'lowStock', label: 'Low Stock Alert', desc: 'Notify when any product hits low stock threshold', iconOn: BellRing, iconOff: BellOff },
                { key: 'outOfStock', label: 'Out of Stock Alert', desc: 'Notify when any product hits zero', iconOn: BellRing, iconOff: BellOff },
                { key: 'creditDue', label: 'Credit Payment Due', desc: 'Notify when a credit bill due date is today or past', iconOn: BellRing, iconOff: BellOff },
                { key: 'stockExpiry', label: 'Stock Expiry Warning', desc: 'Notify when product expiry is within 7 days', iconOn: BellRing, iconOff: BellOff },
                { key: 'newBill', label: 'New Bill Created', desc: 'Notify on every successful checkout', iconOn: BellRing, iconOff: BellOff },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-4 border-b border-gray-100/50 dark:border-white/[0.04] last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{label}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
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

          {/* TEAM SECTION */}
          <div id="team" className={cardCls}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Users size={20} className="text-primary-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Team & Access</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Invite members and manage roles for your business</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_CONFIG[role]?.color || ''}`}>
                {ROLE_CONFIG[role]?.label || role}
              </span>
            </div>

            {/* Invite Form — Owner only */}
            {isOwner && (
              <form onSubmit={handleSendInvite} className="mb-6">
                <label className={labelCls}>Invite a team member</label>
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className={`${inputCls} flex-1`}
                    placeholder="colleague@email.com"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className={`${inputCls} w-[130px] cursor-pointer`}
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviteSending}
                    className="h-[44px] flex items-center justify-center gap-2 bg-primary-600 text-white px-5 rounded-lg text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50 shrink-0"
                  >
                    {inviteSending ? 'Sending...' : <><Send size={14} /> Invite</>}
                  </button>
                </div>
              </form>
            )}

            {/* Pending Invites */}
            {invites.length > 0 && (
              <div className="mb-6">
                <p className={`${labelCls} mb-3`}>Pending Invites</p>
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3 px-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-500/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center">
                          <Send size={14} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-white">{inv.email}</p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Pending · {inv.role}</p>
                        </div>
                      </div>
                      {isOwner && (
                        <button onClick={() => handleCancelInvite(inv)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Team Members */}
            <div>
              <p className={`${labelCls} mb-3`}>Team Members</p>
              <div className="space-y-2">
                {/* Current user — always shown first */}
                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-700 dark:text-primary-300">
                        {(profile.name || 'A').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">{profile.name || 'You'}</p>
                      <p className="text-[11px] text-gray-400">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_CONFIG[role]?.color || ''}`}>
                      {(() => { const RIcon = ROLE_CONFIG[role]?.icon; return RIcon ? <RIcon size={12} /> : null; })()}
                      {ROLE_CONFIG[role]?.label || role}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> You
                    </span>
                  </div>
                </div>

                {/* Other team members */}
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-500 dark:text-gray-300">
                          {(member.displayName || member.email || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{member.displayName || 'Team Member'}</p>
                        <p className="text-[11px] text-gray-400">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_CONFIG[member.role]?.color || ROLE_CONFIG.staff.color}`}>
                        {(() => { const MIcon = ROLE_CONFIG[member.role]?.icon; return MIcon ? <MIcon size={12} /> : null; })()}
                        {ROLE_CONFIG[member.role]?.label || member.role}
                      </span>
                      {isOwner && (
                        <button onClick={() => handleRemoveMember(member)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10" title="Remove member">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {members.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No other team members yet. Send an invite above to get started.</p>
                )}
              </div>
            </div>
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
                    {/* Password Strength Indicator */}
                    {security.newPassword && (
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Password Strength</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${getPasswordStrength(security.newPassword).color.replace('bg-', 'text-')}`}>
                            {getPasswordStrength(security.newPassword).label}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${getPasswordStrength(security.newPassword).color} ${getPasswordStrength(security.newPassword).width} transition-all duration-300`} />
                        </div>
                      </div>
                    )}
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

            {/* Active Sessions */}
            <div className={cardCls}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MonitorSmartphone size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Active Sessions</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Manage devices currently logged into your account</p>
                </div>
                <button onClick={handleSignOutAll} className="flex items-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-xs font-bold transition-colors">
                  <LogOut size={14} /> Sign Out All Devices
                </button>
              </div>
              <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-white/5">
                <div className="flex gap-4">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                    <MonitorSmartphone size={24} className="text-gray-600 dark:text-gray-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">
                        {parseUserAgent(navigator.userAgent)}
                      </p>
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Current Session
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Signed in: {user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
