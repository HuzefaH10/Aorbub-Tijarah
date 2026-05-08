import { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Read from localStorage first to prevent flash
    return localStorage.getItem('app-theme') || 'royal-purple';
  });

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

  const changeTheme = async (newTheme) => {
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
  };

  // Backwards compatibility for components that only read isDark
  const isDark = theme === 'dark' || theme === 'royal-purple';

  return (
    <ThemeContext.Provider value={{ theme, isDark, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
