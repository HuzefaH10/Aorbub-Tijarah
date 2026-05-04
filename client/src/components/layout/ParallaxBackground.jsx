import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function ParallaxBackground() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Calculate normalized mouse position (-1 to 1)
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePos({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Orb 1 */}
      <motion.div
        animate={{
          x: mousePos.x * -40,
          y: mousePos.y * -40,
        }}
        transition={{ type: 'spring', damping: 50, stiffness: 100 }}
        className="absolute top-[10%] left-[20%] w-96 h-96 bg-primary-300/20 dark:bg-primary-900/40 rounded-full blur-[100px]"
      />
      
      {/* Orb 2 */}
      <motion.div
        animate={{
          x: mousePos.x * 60,
          y: mousePos.y * 60,
        }}
        transition={{ type: 'spring', damping: 50, stiffness: 100 }}
        className="absolute bottom-[20%] right-[10%] w-[30rem] h-[30rem] bg-amber-400/10 dark:bg-amber-800/20 rounded-full blur-[120px]"
      />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-40" />
    </div>
  );
}
