import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const stored = localStorage.getItem('app-theme');
    const initialTheme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    // Clean up
    root.classList.remove('dark', 'light', 'royal-purple');
    root.removeAttribute('data-theme');

    // Apply new theme
    if (newTheme === 'royal-purple') {
      root.classList.add('dark', 'royal-purple');
      root.setAttribute('data-theme', 'royal-purple');
    } else if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.add('light');
    }
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  // Backwards compatibility for components that only read isDark
  const isDark = theme === 'dark' || theme === 'royal-purple';

  return (
    <ThemeContext.Provider value={{ theme, isDark, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
