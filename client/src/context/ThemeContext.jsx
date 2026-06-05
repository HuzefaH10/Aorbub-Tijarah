import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const ThemeContext = createContext();

const DARK_THEMES = ['dark', 'royal-purple', 'royal-green', 'sharp-silver'];

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'royal-purple';
  });
  const prevThemeRef = useRef(theme);

  // Apply theme immediately on initial state
  useEffect(() => {
    applyTheme(theme);
  }, []);

  // Sync with Firestore when user is authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().theme) {
            const firestoreTheme = userDoc.data().theme;
            setTheme(firestoreTheme);
            applyTheme(firestoreTheme);
            localStorage.setItem('app-theme', firestoreTheme);
          }
        } catch (err) {
          console.error('Failed to load theme from Firestore:', err);
        }
      }
    });
    return unsubscribe;
  }, []);

  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    // Clean up all theme classes and attributes
    root.classList.remove('dark', 'light', 'royal-purple', 'royal-green', 'sharp-silver');
    root.removeAttribute('data-theme');

    // Apply new theme
    if (newTheme === 'light') {
      root.classList.add('light');
    } else if (DARK_THEMES.includes(newTheme)) {
      root.classList.add('dark', newTheme);
      root.setAttribute('data-theme', newTheme);
    } else {
      root.classList.add('dark');
    }
  };

  const changeTheme = async (newTheme) => {
    const previousTheme = theme;
    prevThemeRef.current = previousTheme;
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);

    // Persist to Firestore if user is logged in
    const user = auth.currentUser;
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { theme: newTheme }, { merge: true });
      } catch (err) {
        console.error('Failed to save theme to Firestore:', err);
      }
    }

    return { from: previousTheme, to: newTheme };
  };

  // Backwards compatibility for components that only read isDark
  const isDark = DARK_THEMES.includes(theme) || theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, isDark, changeTheme, previousTheme: prevThemeRef.current }}>
      {children}
    </ThemeContext.Provider>
  );
}
