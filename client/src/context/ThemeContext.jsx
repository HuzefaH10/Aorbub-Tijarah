import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const ThemeContext = createContext();

// Valid color themes (palette only, no mode)
const COLOR_THEMES = ['royal-purple', 'royal-green', 'sharp-silver', 'dark'];
const THEME_MODES  = ['dark', 'light'];

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Reads color theme + mode from a combined theme string.
 * Legacy strings like 'light' are normalized.
 *   'royal-purple'       → { colorTheme: 'royal-purple', themeMode: 'dark' }
 *   'royal-purple-light' → { colorTheme: 'royal-purple', themeMode: 'light' }
 *   'light'              → { colorTheme: 'royal-purple', themeMode: 'light' }
 *   'dark'               → { colorTheme: 'dark',         themeMode: 'dark' }
 */
function parseTheme(raw) {
  if (!raw) return { colorTheme: 'royal-purple', themeMode: 'dark' };
  // Legacy light-only
  if (raw === 'light') return { colorTheme: 'royal-purple', themeMode: 'light' };
  // Combined strings e.g. 'royal-purple-light'
  if (raw.endsWith('-light')) {
    const base = raw.slice(0, -'-light'.length);
    return { colorTheme: COLOR_THEMES.includes(base) ? base : 'royal-purple', themeMode: 'light' };
  }
  // Plain dark base themes
  if (COLOR_THEMES.includes(raw)) return { colorTheme: raw, themeMode: 'dark' };
  return { colorTheme: 'royal-purple', themeMode: 'dark' };
}

/** Produces the persisted string e.g. 'royal-purple-light' or 'royal-purple' */
function serializeTheme(colorTheme, themeMode) {
  if (themeMode === 'light') return `${colorTheme}-light`;
  return colorTheme;
}

export function ThemeProvider({ children }) {
  const stored = localStorage.getItem('app-theme') || 'royal-purple';
  const parsed  = parseTheme(stored);

  const [colorTheme, setColorTheme] = useState(parsed.colorTheme);
  const [themeMode,  setThemeMode]  = useState(parsed.themeMode);

  const prevRef = useRef(stored);

  // Apply on mount
  useEffect(() => {
    applyTheme(colorTheme, themeMode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from Firestore on auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists() && snap.data().theme) {
            const { colorTheme: ct, themeMode: tm } = parseTheme(snap.data().theme);
            setColorTheme(ct);
            setThemeMode(tm);
            applyTheme(ct, tm);
            localStorage.setItem('app-theme', snap.data().theme);
          }
        } catch (err) {
          console.error('Failed to load theme from Firestore:', err);
        }
      }
    });
    return unsubscribe;
  }, []);

  function applyTheme(ct, tm) {
    const root = document.documentElement;
    // Clean previous state
    root.classList.remove('dark', 'light', 'royal-purple', 'royal-green', 'sharp-silver', 'gold-black');
    root.removeAttribute('data-theme');
    root.removeAttribute('data-mode');

    if (tm === 'light') {
      root.classList.add('light');
      root.setAttribute('data-theme', ct);
      root.setAttribute('data-mode', 'light');
    } else {
      root.classList.add('dark');
      if (ct !== 'dark') {
        root.setAttribute('data-theme', ct);
      }
    }
  }

  /**
   * Change just the color palette — keeps current mode.
   * Also accepts legacy combined strings for backward compatibility.
   */
  const changeTheme = async (newVal) => {
    // Accept both a raw color theme name and a serialized combined string
    const { colorTheme: newCT, themeMode: newTM } = COLOR_THEMES.includes(newVal)
      ? { colorTheme: newVal, themeMode }   // keep current mode
      : parseTheme(newVal);                 // full parse (legacy / external)

    const previousSerialized = serializeTheme(colorTheme, themeMode);
    prevRef.current = previousSerialized;

    setColorTheme(newCT);
    setThemeMode(newTM);
    applyTheme(newCT, newTM);

    const serialized = serializeTheme(newCT, newTM);
    localStorage.setItem('app-theme', serialized);

    const user = auth.currentUser;
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { theme: serialized }, { merge: true });
      } catch (err) {
        console.error('Failed to save theme to Firestore:', err);
      }
    }

    return { from: previousSerialized, to: serialized };
  };

  /** Change just the light/dark mode — keeps current color theme */
  const changeMode = async (newMode) => {
    if (!THEME_MODES.includes(newMode)) return;
    const previousSerialized = serializeTheme(colorTheme, themeMode);
    prevRef.current = previousSerialized;

    setThemeMode(newMode);
    applyTheme(colorTheme, newMode);

    const serialized = serializeTheme(colorTheme, newMode);
    localStorage.setItem('app-theme', serialized);

    const user = auth.currentUser;
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { theme: serialized }, { merge: true });
      } catch (err) {
        console.error('Failed to save mode to Firestore:', err);
      }
    }

    return { from: previousSerialized, to: serialized };
  };

  // Backwards compat
  const isDark = themeMode === 'dark';
  // The legacy `theme` string used throughout the app
  const theme = colorTheme;

  return (
    <ThemeContext.Provider value={{
      theme,
      colorTheme,
      themeMode,
      isDark,
      changeTheme,
      changeMode,
      previousTheme: prevRef.current,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
