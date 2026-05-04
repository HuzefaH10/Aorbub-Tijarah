import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useFirestore';
import { Save, Bell, Shield, KeyRound, Building2, User } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Toast from '../components/ui/Toast';

export default function Settings() {
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const { settings, updateSettings } = useSettings();
  
  const [profile, setProfile] = useState({
    name: user?.email?.split('@')[0] || 'Admin',
    email: user?.email || '',
    phone: '+971 50 123 4567'
  });

  const [business, setBusiness] = useState({
    name: 'Supreme Sanitory',
    address: 'Dubai Design District, UAE',
    currency: 'USD ($)'
  });

  useEffect(() => {
    if (settings) {
      setBusiness(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const handleProfileSave = (e) => {
    e.preventDefault();
    showToast('Profile saved successfully');
  };

  const handleBusinessSave = async (e) => {
    e.preventDefault();
    await updateSettings(business);
    showToast('Business settings updated');
  };

  const inputCls = "w-full glass text-gray-800 dark:text-white px-4 py-2.5 text-sm outline-none focus:border-primary-500 transition-all";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";

  return (
    <div className="max-w-4xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your account and business preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl text-sm font-medium transition-colors">
            <User size={18} /> My Profile
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors">
            <Building2 size={18} /> Business Details
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors">
            <Bell size={18} /> Notifications
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors">
            <Shield size={18} /> Security
          </button>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <User size={20} className="text-primary-500" /> Profile Information
            </h3>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email Address</label>
                <input value={profile.email} disabled className={`${inputCls} opacity-50 cursor-not-allowed`} />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact support if needed.</p>
              </div>
              <div className="pt-2">
                <button type="submit" className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </form>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-primary-500" /> Business Settings
            </h3>
            <form onSubmit={handleBusinessSave} className="space-y-4">
              <div>
                <label className={labelCls}>Business Name</label>
                <input value={business.name} onChange={e => setBusiness({...business, name: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Business Address</label>
                <input value={business.address} onChange={e => setBusiness({...business, address: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Default Currency</label>
                <select value={business.currency} onChange={e => setBusiness({...business, currency: e.target.value})} className={inputCls}>
                  <option>USD ($)</option>
                  <option>AED (د.إ)</option>
                  <option>EUR (€)</option>
                  <option>GBP (£)</option>
                </select>
              </div>
              <div className="pt-2">
                <button type="submit" className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <Save size={16} /> Update Business Details
                </button>
              </div>
            </form>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <KeyRound size={20} className="text-amber-500" /> Master Password
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This is the password required to edit or delete sensitive data in the Profit Optimization and Inventory tabs.
            </p>
            <div className="flex gap-3">
              <input type="password" value="edit123" disabled className={`${inputCls} max-w-xs`} />
              <button className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Change Password
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
