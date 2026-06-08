import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ParallaxBackground from './ParallaxBackground';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { StockAlertProvider } from '../../context/StockAlertContext';
import OnboardingFlow from '../onboarding/OnboardingFlow';

export default function Layout() {
  const location = useLocation();

  return (
    <StockAlertProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
        <ParallaxBackground />
        <Sidebar />
        <div className="ml-[64px] relative z-10">
          <Topbar />
          <main className="p-6 mt-16">
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
        <OnboardingFlow />
      </div>
    </StockAlertProvider>
  );
}

