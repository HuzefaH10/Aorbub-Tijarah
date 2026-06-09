import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signup = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  /**
   * Update Firebase Auth user profile (displayName, photoURL).
   * After updating, refresh the local user state so callers see
   * the new values without waiting for onAuthStateChanged to re-fire.
   */
  const updateUserProfile = async (updates) => {
    if (!auth.currentUser) return;
    await firebaseUpdateProfile(auth.currentUser, updates);
    // Force a re-render by copying the updated user object
    setUser({ ...auth.currentUser });
  };

  const value = { user, signup, login, logout, loading, updateUserProfile };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
