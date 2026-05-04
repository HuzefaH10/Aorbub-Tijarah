import { NavLink } from 'react-router-dom';
import {
  BarChart3, DollarSign, Package, CalendarDays, Settings, PenLine, Home
} from 'lucide-react';

const navItems = [
  { to: '/', icon: Home, label: 'Command Center', size: 24 },
  { to: '/analytics', icon: BarChart3, label: 'Sales Analytics' },
  { to: '/profit', icon: DollarSign, label: 'Profit Optimization' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
];

export default function Sidebar() {
  return (
    <aside className="group fixed left-0 top-0 h-full bg-sidebar z-50 w-[64px] hover:w-[250px] transition-all duration-300 flex flex-col overflow-hidden shadow-xl">
      {/* Brand */}
      <div className="h-16 flex items-center px-4 gap-3 border-b border-white/10 shrink-0">
        <div className="min-w-[32px] h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white text-lg font-bold font-heading">
          AT
        </div>
        <span className="text-white font-heading text-lg font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          Aorbub Tijarah
        </span>
      </div>

      {/* Section label */}
      <p className="text-[10px] text-white/30 uppercase tracking-[0.15em] px-5 mt-5 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        Modules
      </p>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map(({ to, icon: Icon, label, size }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <span className="w-6 flex justify-center items-center shrink-0">
              <Icon size={size || 20} />
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-2 mb-6">
        <NavLink
          to="/data-entry"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              isActive
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <span className="w-6 flex justify-center items-center shrink-0">
            <PenLine size={24} />
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Stock Entry
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
