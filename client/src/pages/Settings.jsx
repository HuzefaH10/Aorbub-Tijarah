import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useFirestore';
import { useRole, useTeam } from '../hooks/useRole';
import { useAuditLog, writeAuditLog, ACTION_TYPES } from '../hooks/useAuditLog';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useLoginHistory } from '../hooks/useLoginHistory';
import { Save, Bell, Shield, KeyRound, Building2, User, BellRing, BellOff, Eye, EyeOff, Check, Camera, MonitorSmartphone, LogOut, Users, Send, X, Crown, ShieldCheck, UserCog, Palette, Clock, Copy, Download, Upload, UploadCloud, Database, FileJson, FileSpreadsheet, AlertTriangle, ScrollText, Search, ChevronLeft, ChevronRight, RefreshCw, Receipt, Smartphone, Laptop, Tablet, Globe, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';
import TabBillHistory from '../components/settings/TabBillHistory';
import DeleteAccountModal from '../components/settings/DeleteAccountModal';
import TabDataImport from '../components/settings/TabDataImport';
import Pagination from '../components/ui/Pagination';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

const TABS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'business', label: 'Business Details', icon: Building2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'bills', label: 'Bill History', icon: Receipt, ownerOnly: true },
  { id: 'import', label: 'Data Import', icon: UploadCloud, ownerOnly: true },
  { id: 'data', label: 'Data & Privacy', icon: Database },
  { id: 'audit', label: 'Audit Log', icon: ScrollText, ownerOnly: true },
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

// Compress image to a base64 data URL using canvas
const compressImage = (file, maxWidth, maxHeight, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;

        if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
        if (h > maxHeight) { w = (maxHeight / h) * w; h = maxHeight; }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const { settings, updateSettings } = useSettings();
  const { role, hasPermission, isOwner, isAdmin } = useRole();
  const { members, invites, sendInvite, cancelInvite, removeMember } = useTeam();
  const { theme, changeTheme } = useTheme();
  const auditLog = useAuditLog();
  const navigate = useNavigate();
  const { history: loginHistory, loading: loginHistoryLoading } = useLoginHistory(user?.uid);

  const [activeTab, setActiveTab] = useState('profile');

  // ── Team state ──
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviteSending, setInviteSending] = useState(false);

  // ── Profile helpers ──
  const parseUserAgent = () => {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    return `${browser} on ${os}`;
  };

  // ── Profile state ──
  const [profile, setProfile] = useState({
    name: user?.email?.split('@')[0] || 'Admin',
    displayName: '',
    email: user?.email || '',
    phone: '+971 50 123 4567',
    phoneSecondary: '',
    emailBackup: '',
    language: 'en',
    bio: '',
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
            name: data.fullName || data.displayName || prev.name,
            displayName: data.displayName || data.fullName || prev.displayName,
            phone: data.phone || prev.phone,
            phoneSecondary: data.phoneSecondary || '',
            emailBackup: data.emailBackup || '',
            language: data.language || 'en',
            bio: data.bio || '',
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

  const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' };
  const defaultHours = () => Object.fromEntries(DAYS.map(d => [d, { open: '09:00', close: '18:00', closed: false }]));

  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [businessHours, setBusinessHours] = useState(defaultHours);
  const [hoursSaving, setHoursSaving] = useState(false);

  // Load business hours from fetched business data
  useEffect(() => {
    if (!user) return;
    const loadHours = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'businesses', user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.businessHours) {
            setHoursEnabled(data.businessHours.enabled || false);
            if (data.businessHours.hours) setBusinessHours(prev => ({ ...prev, ...data.businessHours.hours }));
          }
        }
      } catch (err) {
        console.error('Failed to load business hours:', err);
      }
    };
    loadHours();
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

  // ── Data & Privacy state ──
  const [exportOptions, setExportOptions] = useState({
    bills: true, products: true, categories: true, events: true, team: true,
  });
  const [exportFormat, setExportFormat] = useState('json');
  const [exporting, setExporting] = useState(false);
  const [restoreModal, setRestoreModal] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // ── Delete Account state ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Collection configs for fetching
  const EXPORT_COLLECTIONS = {
    bills: { name: 'bills', field: 'businessId' },
    products: { name: 'products', field: 'businessId' },
    categories: { name: 'categories', field: 'businessId' },
    events: { name: 'events', field: 'businessId' },
    milestones: { name: 'milestones', field: 'userId' },
    stockHistory: { name: 'stockHistory', field: 'businessId' },
    stockLogs: { name: 'stockLogs', field: 'userId' },
    entries: { name: 'entries', field: 'userId' },
    templates: { name: 'templates', field: 'businessId' },
    team: { name: 'teamMembers', field: 'businessId' },
  };

  const fetchCollectionData = async (colName, field) => {
    if (!user) return [];
    const q = query(collection(db, colName), where(field, '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      // Convert Firestore timestamps to ISO strings for serialization
      const cleaned = {};
      for (const [k, v] of Object.entries(data)) {
        cleaned[k] = v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v;
      }
      return { id: d.id, ...cleaned };
    });
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flattenForCSV = (data) => {
    if (!data.length) return '';
    const keys = [...new Set(data.flatMap(d => Object.keys(d)))];
    const header = keys.join(',');
    const rows = data.map(row => keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    }).join(','));
    return [header, ...rows].join('\n');
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const result = {};
      const selectedKeys = Object.entries(exportOptions).filter(([, v]) => v).map(([k]) => k);

      for (const key of selectedKeys) {
        if (key === 'events') {
          result.events = await fetchCollectionData('events', 'businessId');
          result.milestones = await fetchCollectionData('milestones', 'userId');
        } else if (EXPORT_COLLECTIONS[key]) {
          const cfg = EXPORT_COLLECTIONS[key];
          result[key] = await fetchCollectionData(cfg.name, cfg.field);
        }
      }

      const dateStr = new Date().toISOString().split('T')[0];

      if (exportFormat === 'json') {
        downloadFile(JSON.stringify(result, null, 2), `aorbub-tijarah-backup-${dateStr}.json`, 'application/json');
      } else {
        // CSV — export each collection as a separate section
        let csv = '';
        for (const [key, data] of Object.entries(result)) {
          if (data.length) {
            csv += `--- ${key.toUpperCase()} ---\n`;
            csv += flattenForCSV(data) + '\n\n';
          }
        }
        downloadFile(csv, `aorbub-tijarah-backup-${dateStr}.csv`, 'text/csv');
      }
      showToast('Data exported successfully');
    } catch (err) {
      console.error(err);
      showToast('Failed to export data', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const backup = { _meta: { version: 1, createdAt: new Date().toISOString(), businessId: user.uid } };

      for (const [key, cfg] of Object.entries(EXPORT_COLLECTIONS)) {
        if (key === 'team') continue; // skip team in full backup
        backup[key] = await fetchCollectionData(cfg.name, cfg.field);
      }

      // Also include business settings
      const bizDoc = await getDoc(doc(db, 'businesses', user.uid));
      if (bizDoc.exists()) backup.businessSettings = bizDoc.data();

      const dateStr = new Date().toISOString().split('T')[0];
      downloadFile(JSON.stringify(backup, null, 2), `aorbub-tijarah-full-backup-${dateStr}.json`, 'application/json');
      showToast('Full backup created');
      writeAuditLog(user, role, 'Backup created', 'Full business data backup downloaded');
    } catch (err) {
      console.error(err);
      showToast('Failed to create backup', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || typeof data !== 'object') throw new Error('Invalid file');

        const summary = [];
        const restorableKeys = ['products', 'bills', 'categories', 'events', 'milestones', 'stockHistory', 'stockLogs', 'entries', 'templates'];
        const restoreData = {};

        for (const key of restorableKeys) {
          if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
            restoreData[key] = data[key];
            summary.push(`${data[key].length} ${key}`);
          }
        }

        if (summary.length === 0) {
          showToast('No valid data found in backup file', 'error');
          return;
        }

        setRestoreModal({ data: restoreData, summary });
      } catch {
        showToast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset input
  };

  const handleConfirmRestore = async () => {
    if (!user || !restoreModal) return;
    setRestoring(true);
    try {
      const { data } = restoreModal;

      for (const [colName, items] of Object.entries(data)) {
        // Determine the correct field name for this collection
        const cfg = EXPORT_COLLECTIONS[colName];
        const ownerField = cfg?.field || 'businessId';

        // Delete existing documents first
        const existingQ = query(collection(db, colName), where(ownerField, '==', user.uid));
        const existingSnap = await getDocs(existingQ);
        const batch = writeBatch(db);
        existingSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Write new documents in batches of 500
        for (let i = 0; i < items.length; i += 400) {
          const chunk = items.slice(i, i + 400);
          const writeBatchRef = writeBatch(db);
          for (const item of chunk) {
            const { id, ...rest } = item;
            // Re-assign ownership
            rest[ownerField] = user.uid;
            const newRef = doc(collection(db, colName));
            writeBatchRef.set(newRef, rest);
          }
          await writeBatchRef.commit();
        }
      }

      showToast('Data restored successfully! Refreshing...');
      writeAuditLog(user, role, 'Restore performed', `Restored: ${restoreModal.summary.join(', ')}`);
      setRestoreModal(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      showToast('Failed to restore data', 'error');
    } finally {
      setRestoring(false);
    }
  };

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
      const dataUrl = await compressImage(file, 200, 200, 0.85);
      setProfile(p => ({ ...p, photoURL: dataUrl }));
      await setDoc(doc(db, 'users', user.uid), { photoURL: dataUrl }, { merge: true });
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
    // Validate backup email if filled
    if (profile.emailBackup && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailBackup)) {
      return showToast('Invalid backup email format', 'error');
    }
    setProfileSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        fullName: profile.name,
        displayName: profile.displayName || profile.name,
        phone: profile.phone,
        phoneSecondary: profile.phoneSecondary || null,
        emailBackup: profile.emailBackup || null,
        language: profile.language || 'en',
        bio: profile.bio || null,
        photoURL: profile.photoURL
      }, { merge: true });
      showToast('Profile saved successfully');
      writeAuditLog(user, role, 'Settings changed', 'Profile information updated');
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
      const dataUrl = await compressImage(file, 400, 120, 0.9);
      setBusiness(p => ({ ...p, logoURL: dataUrl }));
      await setDoc(doc(db, 'businesses', user.uid), { logoURL: dataUrl }, { merge: true });
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
      writeAuditLog(user, role, 'Settings changed', 'Business details updated');
    } catch { showToast('Failed to update business details', 'error'); }
    finally { setBusinessSaving(false); }
  };

  const handleHoursSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setHoursSaving(true);
    try {
      await setDoc(doc(db, 'businesses', user.uid), {
        businessHours: { enabled: hoursEnabled, hours: businessHours }
      }, { merge: true });
      showToast('Business hours saved');
      writeAuditLog(user, role, 'Settings changed', `Business hours ${hoursEnabled ? 'enabled' : 'disabled'}`);
    } catch { showToast('Failed to save hours', 'error'); }
    finally { setHoursSaving(false); }
  };

  const updateDayHours = (day, field, value) => {
    setBusinessHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const copyMondayToAll = () => {
    const mon = businessHours.monday;
    setBusinessHours(prev => {
      const updated = { ...prev };
      DAYS.slice(1).forEach(d => { updated[d] = { ...mon }; });
      return updated;
    });
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
      writeAuditLog(user, role, 'Settings changed', 'Notification preferences updated');
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
        writeAuditLog(user, role, 'Password changed', 'Login password changed');
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
      navigate('/login');
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
      writeAuditLog(user, role, 'Team member invited', `Invited ${inviteEmail} as ${inviteRole}`, inviteEmail);
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
      writeAuditLog(user, role, 'Team member removed', `Removed ${member.email}`, member.email);
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
      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />

      {/* Page Header */}
      <div className="border-b border-gray-100 dark:border-gray-800/60 pb-4 mb-6 px-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Settings</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your account and business preferences</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 px-6">
        {/* Left Sidebar — fixed 200px */}
        <nav className="w-[200px] shrink-0 space-y-1.5 sticky top-24 self-start">
          {TABS.filter(t => !t.ownerOnly || isOwner || isAdmin).map(({ id, label, icon: Icon }) => (
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

              {/* Role Badge + Member Since */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Role</label>
                  <div className="h-[44px] flex items-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${ROLE_CONFIG[role]?.color || 'bg-gray-100 text-gray-500'}`}>
                      {(() => { const RIcon = ROLE_CONFIG[role]?.icon; return RIcon ? <RIcon size={14} /> : null; })()}
                      {ROLE_CONFIG[role]?.label || role || 'Owner'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Member Since</label>
                  <p className="h-[44px] flex items-center text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {user?.metadata?.creationTime
                      ? new Date(user.metadata.creationTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Last Login */}
              <div>
                <label className={labelCls}>Last Login</label>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  {user?.metadata?.lastSignInTime
                    ? `${new Date(user.metadata.lastSignInTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${new Date(user.metadata.lastSignInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} — ${parseUserAgent()}`
                    : 'Unknown'}
                </p>
              </div>

              {/* Full Name + Primary Phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} className={inputCls} placeholder="Your full name" />
                </div>
                <div>
                  <label className={labelCls}>Primary Phone Number</label>
                  <input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className={inputCls} placeholder="+971 50 000 0000" />
                </div>
              </div>

              {/* Display Name + Preferred Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Display Name</label>
                  <input value={profile.displayName} onChange={e => setProfile({ ...profile, displayName: e.target.value })} className={inputCls} placeholder="How you appear in the app" />
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">This is what appears across the app</p>
                </div>
                <div>
                  <label className={labelCls}>Preferred Language</label>
                  <select value={profile.language} onChange={e => setProfile({ ...profile, language: e.target.value })} className={`${inputCls} cursor-pointer`}>
                    <option value="en">English (Default)</option>
                    <option value="ar" disabled className="text-gray-400">العربية — Coming Soon</option>
                    <option value="ur" disabled className="text-gray-400">اردو — Coming Soon</option>
                    <option value="hi" disabled className="text-gray-400">हिन्दी — Coming Soon</option>
                    <option value="fr" disabled className="text-gray-400">Français — Coming Soon</option>
                  </select>
                </div>
              </div>

              {/* Secondary Phone */}
              <div>
                <label className={labelCls}>Secondary Phone Number <span className="text-gray-400 dark:text-gray-600 normal-case tracking-normal font-normal">(Optional)</span></label>
                <input value={profile.phoneSecondary} onChange={e => setProfile({ ...profile, phoneSecondary: e.target.value })} className={inputCls} placeholder="+971 55 000 0000" />
                <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">Used for account recovery and security purposes only</p>
              </div>

              {/* Email Addresses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Email Address</label>
                  <input value={profile.email} disabled className={`${inputCls} opacity-50 cursor-not-allowed`} />
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">Email cannot be changed. Contact support if needed.</p>
                </div>
                <div>
                  <label className={labelCls}>Backup Email Address <span className="text-gray-400 dark:text-gray-600 normal-case tracking-normal font-normal">(Optional)</span></label>
                  <input value={profile.emailBackup} onChange={e => setProfile({ ...profile, emailBackup: e.target.value })} className={inputCls} placeholder="backup@email.com" type="email" />
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">We'll use this if your primary email is unreachable</p>
                </div>
              </div>

              {/* Bio / Note */}
              <div>
                <label className={labelCls}>Bio / Note <span className="text-gray-400 dark:text-gray-600 normal-case tracking-normal font-normal">(Optional)</span></label>
                <div className="relative">
                  <textarea
                    value={profile.bio}
                    onChange={e => { if (e.target.value.length <= 120) setProfile({ ...profile, bio: e.target.value }); }}
                    className={`${inputCls} h-[80px] py-3 resize-none`}
                    placeholder="e.g. Store manager - Dubai branch"
                    maxLength={120}
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 dark:text-gray-600 font-bold">
                    {profile.bio.length}/120
                  </span>
                </div>
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

          {/* BUSINESS HOURS CARD */}
          <div className={cardCls}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-500/10">
                  <Clock size={20} className="text-primary-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Business Hours</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Optional — set your store's operating hours</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Enable</span>
                <button
                  type="button"
                  onClick={() => setHoursEnabled(p => !p)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${hoursEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200 ${hoursEnabled ? 'left-[22px]' : 'left-[3px]'}`} />
                </button>
              </div>
            </div>

            {!hoursEnabled ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">Business hours are not set. Enable the toggle above to configure.</p>
            ) : (
              <form onSubmit={handleHoursSave}>
                <div className="space-y-2">
                  {DAYS.map((day, i) => (
                    <div key={day} className={`flex items-center gap-3 py-3 px-4 rounded-lg border transition-colors ${
                      businessHours[day].closed
                        ? 'bg-gray-50/50 dark:bg-gray-900/30 border-gray-100 dark:border-white/[0.03] opacity-60'
                        : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-white/5'
                    }`}>
                      <span className="w-[90px] text-sm font-semibold text-gray-800 dark:text-white shrink-0">{DAY_LABELS[day]}</span>

                      {/* Closed toggle */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateDayHours(day, 'closed', !businessHours[day].closed)}
                          className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${businessHours[day].closed ? 'bg-red-400' : 'bg-gray-300 dark:bg-gray-700'}`}
                        >
                          <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-200 ${businessHours[day].closed ? 'left-[18px]' : 'left-[3px]'}`} />
                        </button>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-[42px]">{businessHours[day].closed ? 'Closed' : 'Open'}</span>
                      </div>

                      {!businessHours[day].closed && (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time"
                            value={businessHours[day].open}
                            onChange={e => updateDayHours(day, 'open', e.target.value)}
                            className="h-[36px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-2.5 text-xs outline-none focus:border-primary-500 rounded-lg w-[110px]"
                          />
                          <span className="text-[10px] text-gray-400 font-bold">to</span>
                          <input
                            type="time"
                            value={businessHours[day].close}
                            onChange={e => updateDayHours(day, 'close', e.target.value)}
                            className="h-[36px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-2.5 text-xs outline-none focus:border-primary-500 rounded-lg w-[110px]"
                          />
                        </div>
                      )}

                      {i > 0 && !businessHours[day].closed && (
                        <button
                          type="button"
                          onClick={() => updateDayHours(day, 'open', businessHours.monday.open) || updateDayHours(day, 'close', businessHours.monday.close) || updateDayHours(day, 'closed', businessHours.monday.closed)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-md transition-colors shrink-0"
                          title="Copy Monday's hours"
                        >
                          <Copy size={10} /> Mon
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="pt-5 flex justify-end">
                  <button type="submit" disabled={hoursSaving} className={saveBtnCls}>
                    {hoursSaving ? 'Saving...' : <><Save size={15} /> Save Hours</>}
                  </button>
                </div>
              </form>
            )}
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

          {/* APPEARANCE SECTION */}
          <div id="appearance" className={cardCls}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Palette size={20} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Appearance</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Customize how Aorbub Tijarah looks for you</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Royal Purple */}
              <button
                onClick={async () => { const r = await changeTheme('royal-purple'); writeAuditLog(user, role, 'THEME_CHANGED', `Theme changed from ${r.from} to ${r.to}`, null, activeBusinessId); }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  theme === 'royal-purple'
                    ? 'border-primary-500 ring-2 ring-primary-500/30 shadow-lg shadow-primary-500/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-primary-400'
                }`}
              >
                <div className="w-full h-[80px] relative" style={{ background: '#0D0D1A' }}>
                  <div className="absolute inset-0 p-2.5">
                    <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: '#7C3AED', width: '60%' }} />
                    <div className="flex gap-1.5">
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1a1a2e' }} />
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1a1a2e' }} />
                    </div>
                    <div className="mt-1.5 w-full h-3 rounded" style={{ background: '#1a1a2e' }}>
                      <div className="h-full rounded" style={{ background: '#7C3AED', width: '40%', opacity: 0.5 }} />
                    </div>
                  </div>
                  {theme === 'royal-purple' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-white dark:bg-gray-900/80">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Royal Purple</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Default</p>
                </div>
              </button>

              {/* Royal Green */}
              <button
                onClick={async () => { const r = await changeTheme('royal-green'); writeAuditLog(user, role, 'THEME_CHANGED', `Theme changed from ${r.from} to ${r.to}`, null, activeBusinessId); }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  theme === 'royal-green'
                    ? 'border-green-500 ring-2 ring-green-500/30 shadow-lg shadow-green-500/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-green-400'
                }`}
              >
                <div className="w-full h-[80px] relative" style={{ background: '#0a0f0a' }}>
                  <div className="absolute inset-0 p-2.5">
                    <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: '#2e7d32', width: '60%' }} />
                    <div className="flex gap-1.5">
                      <div className="w-1/2 h-6 rounded" style={{ background: '#162016' }} />
                      <div className="w-1/2 h-6 rounded" style={{ background: '#162016' }} />
                    </div>
                    <div className="mt-1.5 w-full h-3 rounded" style={{ background: '#162016' }}>
                      <div className="h-full rounded" style={{ background: '#ffd600', width: '40%', opacity: 0.5 }} />
                    </div>
                  </div>
                  {theme === 'royal-green' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#2e7d32' }}>
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-white dark:bg-gray-900/80">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Royal Green</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Emerald & gold</p>
                </div>
              </button>

              {/* Sharp Silver */}
              <button
                onClick={async () => { const r = await changeTheme('sharp-silver'); writeAuditLog(user, role, 'THEME_CHANGED', `Theme changed from ${r.from} to ${r.to}`, null, activeBusinessId); }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  theme === 'sharp-silver'
                    ? 'border-gray-400 ring-2 ring-gray-400/30 shadow-lg shadow-gray-400/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-gray-400'
                }`}
              >
                <div className="w-full h-[80px] relative" style={{ background: '#0c0c0e' }}>
                  <div className="absolute inset-0 p-2.5">
                    <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: '#9e9e9e', width: '60%' }} />
                    <div className="flex gap-1.5">
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1a1a20' }} />
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1a1a20' }} />
                    </div>
                    <div className="mt-1.5 w-full h-3 rounded" style={{ background: '#1a1a20' }}>
                      <div className="h-full rounded" style={{ background: '#00b0ff', width: '40%', opacity: 0.5 }} />
                    </div>
                  </div>
                  {theme === 'sharp-silver' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#9e9e9e' }}>
                      <Check size={12} className="text-black" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-white dark:bg-gray-900/80">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Sharp Silver</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Terminal chic</p>
                </div>
              </button>

              {/* Light Mode */}
              <button
                onClick={async () => { const r = await changeTheme('light'); writeAuditLog(user, role, 'THEME_CHANGED', `Theme changed from ${r.from} to ${r.to}`, null, activeBusinessId); }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  theme === 'light'
                    ? 'border-primary-500 ring-2 ring-primary-500/30 shadow-lg shadow-primary-500/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-primary-400'
                }`}
              >
                <div className="w-full h-[80px] relative" style={{ background: '#F8F9FA' }}>
                  <div className="absolute inset-0 p-2.5">
                    <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: '#7C3AED', width: '60%' }} />
                    <div className="flex gap-1.5">
                      <div className="w-1/2 h-6 rounded" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }} />
                      <div className="w-1/2 h-6 rounded" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }} />
                    </div>
                    <div className="mt-1.5 w-full h-3 rounded" style={{ background: '#E5E7EB' }}>
                      <div className="h-full rounded" style={{ background: '#7C3AED', width: '40%', opacity: 0.5 }} />
                    </div>
                  </div>
                  {theme === 'light' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-white dark:bg-gray-900/80">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Light Mode</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Clean & bright</p>
                </div>
              </button>

              {/* Gold & Black */}
              <button
                onClick={async () => { const r = await changeTheme('dark'); writeAuditLog(user, role, 'THEME_CHANGED', `Theme changed from ${r.from} to ${r.to}`, null, activeBusinessId); }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  theme === 'dark'
                    ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-amber-400'
                }`}
              >
                <div className="w-full h-[80px] relative" style={{ background: '#0A0A0A' }}>
                  <div className="absolute inset-0 p-2.5">
                    <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: '#F59E0B', width: '60%' }} />
                    <div className="flex gap-1.5">
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1A1A1A' }} />
                      <div className="w-1/2 h-6 rounded" style={{ background: '#1A1A1A' }} />
                    </div>
                    <div className="mt-1.5 w-full h-3 rounded" style={{ background: '#1A1A1A' }}>
                      <div className="h-full rounded" style={{ background: '#F59E0B', width: '40%', opacity: 0.5 }} />
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-white dark:bg-gray-900/80">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Gold & Black</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Premium dark</p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-4 text-center">Theme is applied instantly and saved to your account.</p>
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

            {/* Active Sessions + Login Activity */}
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
              <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-white/5 mb-6">
                <div className="flex gap-4">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                    <MonitorSmartphone size={24} className="text-gray-600 dark:text-gray-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">
                        {parseUserAgent()}
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

              {/* Login Activity Table */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={16} className="text-primary-500" />
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Login Activity</h4>
                  <span className="text-xs text-gray-400">— last 10 events</span>
                </div>
                {loginHistoryLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : loginHistory.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No login events recorded yet. They will appear after your next login.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/5">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/60">
                        <tr>
                          {['Date & Time', 'Device', 'Browser', 'OS', 'Location', 'Status'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                        {loginHistory.map((entry, i) => {
                          const ts = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date();
                          const isFirst = i === 0;
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">
                                {ts.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 font-medium capitalize">
                                  {entry.device === 'mobile' ? <Smartphone size={13} /> : entry.device === 'tablet' ? <Tablet size={13} /> : <Laptop size={13} />}
                                  {entry.device || '—'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{entry.browser || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{entry.os || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {isFirst ? (
                                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Current session
                                  </span>
                                ) : (
                                  entry.location?.city && entry.location.city !== 'Unknown'
                                    ? `${entry.location.city}, ${entry.location.country}`
                                    : 'Unknown location'
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {entry.status === 'success' ? (
                                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold">
                                    <CheckCircle size={13} /> Success
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-red-500 text-xs font-bold">
                                    <XCircle size={13} /> Failed
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* DANGER ZONE — Owner only */}
            {isOwner && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-7 mt-2">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-red-500/10">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Trash2 size={20} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-red-500 font-heading">Delete Account</h3>
                    <p className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wider font-bold mt-0.5">Danger Zone</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed mb-5">
                  Permanently deletes your account, all businesses, branches, products, sales, expenses, staff records, and every piece of data associated with your account. This action is irreversible and cannot be undone.
                </p>
                <button
                  id="delete-account-btn"
                  onClick={() => setShowDeleteModal(true)}
                  className="h-[44px] px-6 rounded-lg border border-red-500/40 text-red-500 text-sm font-bold hover:bg-red-500/10 hover:border-red-500/60 transition-all"
                >
                  Delete My Account
                </button>
              </div>
            )}
          </div>

          {/* DATA & PRIVACY SECTION */}
          <div id="data" className="space-y-6">
            {/* Export Data Card */}
            <div className={cardCls}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="p-2 rounded-lg bg-primary-500/10">
                  <Download size={20} className="text-primary-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Export Business Data</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Download a full copy of your business data</p>
                </div>
              </div>

              <div className="mb-5">
                <p className={labelCls}>What to include</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { key: 'bills', label: 'Bills & Transactions' },
                    { key: 'products', label: 'Inventory & Products' },
                    { key: 'categories', label: 'Categories' },
                    { key: 'events', label: 'Calendar Events & Milestones' },
                    { key: 'team', label: 'Team Members' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2.5 py-2.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-white/5 cursor-pointer hover:border-primary-400 transition-colors">
                      <input
                        type="checkbox"
                        checked={exportOptions[key]}
                        onChange={() => setExportOptions(p => ({ ...p, [key]: !p[key] }))}
                        className="w-4 h-4 rounded accent-primary-600"
                      />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2">Format</p>
                  <button
                    type="button"
                    onClick={() => setExportFormat('json')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${exportFormat === 'json' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700'}`}
                  >
                    <FileJson size={14} /> JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${exportFormat === 'csv' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700'}`}
                  >
                    <FileSpreadsheet size={14} /> CSV
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className={saveBtnCls}
                >
                  {exporting ? 'Exporting...' : <><Download size={15} /> Export Now</>}
                </button>
              </div>
            </div>

            {/* Backup & Restore Card */}
            <div className={cardCls}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Database size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Backup & Restore</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Restore your data from a previously exported JSON backup file</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={exporting}
                  className="flex-1 h-[60px] flex flex-col items-center justify-center gap-1.5 bg-primary-50 dark:bg-primary-500/10 hover:bg-primary-100 dark:hover:bg-primary-500/20 border-2 border-dashed border-primary-300 dark:border-primary-500/30 rounded-xl transition-colors cursor-pointer"
                >
                  <Download size={18} className="text-primary-600 dark:text-primary-400" />
                  <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{exporting ? 'Creating...' : 'Create Backup'}</span>
                </button>

                <label className="flex-1 h-[60px] flex flex-col items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border-2 border-dashed border-amber-300 dark:border-amber-500/30 rounded-xl transition-colors cursor-pointer">
                  <Upload size={18} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Restore from Backup</span>
                  <input type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />
                </label>
              </div>
            </div>
          </div>

          {/* Restore Confirmation Modal */}
          {restoreModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-full bg-red-100 dark:bg-red-500/20">
                    <AlertTriangle size={22} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-800 dark:text-white">Confirm Restore</h3>
                    <p className="text-xs text-red-500 font-semibold">This will overwrite your current data. This cannot be undone.</p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-5 space-y-1.5">
                  <p className={labelCls}>What will be restored:</p>
                  {restoreModal.summary.map((line, i) => (
                    <p key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      <Check size={12} className="text-green-500" /> {line}
                    </p>
                  ))}
                </div>

                {restoring && (
                  <div className="mb-4">
                    <div className="h-2 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">Restoring data... please wait</p>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setRestoreModal(null)}
                    disabled={restoring}
                    className="h-[44px] px-5 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={restoring}
                    className="h-[44px] flex items-center justify-center gap-2 bg-red-600 text-white px-6 rounded-lg text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                  >
                    {restoring ? 'Restoring...' : <><Upload size={15} /> Confirm Restore</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BILL HISTORY SECTION — owner/admin only */}
          {(isOwner || isAdmin) && (
            <TabBillHistory cardCls={cardCls} labelCls={labelCls} inputCls={inputCls} />
          )}

          {/* DATA IMPORT SECTION — owner only */}
          {isOwner && (
            <div id="import" className={cardCls}>
              <TabDataImport />
            </div>
          )}

          {/* AUDIT LOG SECTION — owner/admin only */}
          {(isOwner || isAdmin) && (
            <div id="audit" className={cardCls}>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-500/10">
                    <ScrollText size={20} className="text-primary-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Audit Log</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Activity history for your business (last 90 days)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={auditLog.refreshLogs} className="p-2 text-gray-400 hover:text-primary-500 transition-colors rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10" title="Refresh">
                    <RefreshCw size={16} />
                  </button>
                  <button onClick={auditLog.exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-lg text-xs font-bold hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors">
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-5">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">From</label>
                  <input type="date" value={auditLog.filters.dateFrom} onChange={e => auditLog.applyFilters({ ...auditLog.filters, dateFrom: e.target.value })} className="h-[34px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-2.5 text-xs outline-none focus:border-primary-500 rounded-lg" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">To</label>
                  <input type="date" value={auditLog.filters.dateTo} onChange={e => auditLog.applyFilters({ ...auditLog.filters, dateTo: e.target.value })} className="h-[34px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-2.5 text-xs outline-none focus:border-primary-500 rounded-lg" />
                </div>
                <select value={auditLog.filters.action} onChange={e => auditLog.applyFilters({ ...auditLog.filters, action: e.target.value })} className="h-[34px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white px-2.5 text-xs outline-none focus:border-primary-500 rounded-lg cursor-pointer">
                  <option value="">All Actions</option>
                  {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={auditLog.filters.search}
                    onChange={e => auditLog.applyFilters({ ...auditLog.filters, search: e.target.value })}
                    placeholder="Search details..."
                    className="h-[34px] w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-white pl-9 pr-3 text-xs outline-none focus:border-primary-500 rounded-lg"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200/60 dark:border-white/[0.06]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/80 border-b border-gray-200/60 dark:border-white/[0.06]">
                      <th className="text-left px-4 py-3 font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px] w-[160px]">Time</th>
                      <th className="text-left px-4 py-3 font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px] w-[100px]">User</th>
                      <th className="text-left px-4 py-3 font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px] w-[70px]">Role</th>
                      <th className="text-left px-4 py-3 font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px] w-[140px]">Action</th>
                      <th className="text-left px-4 py-3 font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.loading ? (
                      <tr><td colSpan={5} className="text-center py-10 text-gray-400"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                    ) : auditLog.logs.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-gray-400 dark:text-gray-600">No audit log entries found</td></tr>
                    ) : (
                      auditLog.logs.map(log => (
                        <tr key={log.id} className="border-b border-gray-100/50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {log.timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{' '}
                            <span className="text-gray-400 dark:text-gray-600">{log.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-800 dark:text-white font-semibold">{log.userName}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ROLE_CONFIG[log.userRole]?.color || 'bg-gray-100 text-gray-500'}`}>
                              {log.userRole}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{log.action}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={log.details}>{log.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <Pagination 
                currentPage={auditLog.page}
                totalPages={auditLog.totalPages}
                totalCount={auditLog.totalCount}
                pageSize={auditLog.PAGE_SIZE}
                onNext={auditLog.nextPage}
                onPrevious={auditLog.prevPage}
              />
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
