import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ParallaxBackground from './ParallaxBackground';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PenLine } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <ParallaxBackground />
      <Sidebar />
      <div className="ml-[64px] relative z-10">
        <Topbar />
        <main className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <button
        onClick={() => navigate('/data-entry')}
        className="fixed bottom-8 right-8 z-50 flex items-center gap-2 bg-primary-600 text-white px-5 py-3.5 rounded-full font-bold shadow-2xl shadow-primary-600/30 hover:bg-primary-700 hover:scale-105 transition-all active:scale-95 group"
      >
        <PenLine size={20} className="group-hover:rotate-12 transition-transform" />
        <span>Stock Entry</span>
      </button>
    </div>
  );
}
