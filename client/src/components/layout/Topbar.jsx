import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChevronDown, Settings, Sun, Moon, HelpCircle, LogOut, Palette } from 'lucide-react';

const titles = {
  '/': 'Command Center',
  '/profit': 'Profit Optimization',
  '/inventory': 'Inventory Management',
  '/calendar': 'Calendar & Scheduling',
  '/settings': 'Settings',
  '/help': 'Help & Contact'
};

export default function Topbar() {
  const { user, logout } = useAuth();
  const { theme, changeTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const timerRef = useRef();

  const enter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const leave = () => { timerRef.current = setTimeout(() => setOpen(false), 200); };

  const today = new Date().toLocaleDateString('en-US', {
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

  return (
    <header className="h-16 glass !rounded-none !border-t-0 !border-x-0 flex items-center justify-between px-6 sticky top-0 z-40 transition-colors duration-300">
      <div>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white font-heading">{title}</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500">Last updated: {today}</p>
      </div>

      {/* Account dropdown */}
      <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
        <button className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full pl-1.5 pr-3.5 py-1.5 transition-colors border border-gray-100 dark:border-gray-700">
          <div className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">
            {user?.email?.charAt(0).toUpperCase() || 'A'}
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
            {user?.email?.split('@')[0] || 'Admin'}
          </span>
          <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-60 glass overflow-clip animate-fadeIn origin-top-right">
            <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <p className="text-sm text-gray-800 dark:text-white font-semibold">{user?.email || 'admin@aorbub.com'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Owner</p>
            </div>
            <div className="py-1.5">
              <button onClick={() => navTo('/settings')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <Settings size={16} /> Settings
              </button>
              <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-2 mb-2 font-semibold">
                  <Palette size={16} /> Appearance
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => changeTheme('light')} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${theme === 'light' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                    <div className="flex items-center gap-2"><Sun size={14}/> Light Mode</div>
                    {theme === 'light' && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                  </button>
                  <button onClick={() => changeTheme('dark')} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${theme === 'dark' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                    <div className="flex items-center gap-2"><Moon size={14} className="text-[#c9a84c]"/> Gold & Black</div>
                    {theme === 'dark' && <div className="w-2 h-2 rounded-full bg-[#c9a84c]" />}
                  </button>
                  <button onClick={() => changeTheme('royal-purple')} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${theme === 'royal-purple' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                    <div className="flex items-center gap-2"><Moon size={14} className="text-[#9B30FF]"/> Royal Purple</div>
                    {theme === 'royal-purple' && <div className="w-2 h-2 rounded-full bg-[#9B30FF]" />}
                  </button>
                </div>
              </div>
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
    </header>
  );
}
