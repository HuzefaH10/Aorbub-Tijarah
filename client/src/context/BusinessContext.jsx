import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  doc, setDoc, addDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from './AuthContext';

const BusinessContext = createContext();

export function useBusiness() {
  return useContext(BusinessContext);
}

export function BusinessProvider({ children }) {
  const { user } = useAuth();

  // ── User document state ──
  const [userProfile, setUserProfile] = useState(null);      // full users/{uid} doc
  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [businesses, setBusinesses] = useState([]);

  // ── Active business document state ──
  const [businessData, setBusinessData] = useState(null);    // full businesses/{id} doc

  const [loading, setLoading] = useState(true);

  // ── Listen to users/{uid} — reactive ──
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setActiveBusinessId(null);
      setBusinesses([]);
      setBusinessData(null);
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) {
        // Bootstrap first-time user
        const defaultId = user.uid;
        await setDoc(userRef, {
          businesses: [defaultId],
          activeBusinessId: defaultId,
          role: 'owner',
        }, { merge: true });
        return; // will re-fire
      }

      const data = snap.data();
      setUserProfile({ id: user.uid, ...data });

      const bizIds = data.businesses?.length ? data.businesses : [user.uid];
      const activeBizId = data.activeBusinessId || user.uid;
      setActiveBusinessId(activeBizId);

      // Build minimal businesses list for switcher (names only — full data via separate listener)
      setBusinesses(bizIds.map(id => ({
        id,
        name: id === activeBizId ? (data.businessName || 'My Business') : id,
        role: data.role || 'owner',
        currency: data.currency || 'USD',
      })));
    }, (err) => { console.error('BusinessContext user listener:', err); });

    return unsub;
  }, [user]);

  // ── Listen to businesses/{activeBusinessId} — reactive, re-attaches on switch ──
  useEffect(() => {
    if (!activeBusinessId) return;

    const bizRef = doc(db, 'businesses', activeBusinessId);
    const unsub = onSnapshot(bizRef, (snap) => {
      if (snap.exists()) {
        setBusinessData({ id: activeBusinessId, ...snap.data() });
        // Back-fill business name into businesses list
        setBusinesses(prev => prev.map(b =>
          b.id === activeBusinessId
            ? { ...b, name: snap.data().businessName || snap.data().name || 'My Business', currency: snap.data().currency || 'USD' }
            : b
        ));
      } else {
        // Business doc doesn't exist yet (e.g. user's own UID-based biz) — use user profile data
        setBusinessData(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('BusinessContext biz listener:', err);
      setLoading(false);
    });

    return unsub;
  }, [activeBusinessId]);

  // ── Derived values ──
  const activeBusiness = businesses.find(b => b.id === activeBusinessId) || businesses[0];

  // user profile fields
  const userRole       = userProfile?.role || 'owner';
  const displayName    = userProfile?.displayName || userProfile?.fullName || user?.email?.split('@')[0] || '';
  const theme          = userProfile?.theme || 'royal-purple';
  const notificationPrefs = userProfile?.notificationPreferences || {
    lowStock: true, creditDue: true, newBill: true, expiryWarning: true,
  };

  // business doc fields
  const timezone       = businessData?.timezone || 'Asia/Karachi';
  const currency       = businessData?.currency || activeBusiness?.currency || 'USD';
  const billDefaults   = businessData?.billDefaults || {
    defaultPaymentMethod: 'cash',
    defaultDiscount: '',
    defaultDiscountType: '$',
    showDiscountByDefault: false,
  };
  const businessHours  = businessData?.businessHours || null;

  // ── Switch active business ──
  const switchBusiness = useCallback(async (businessId) => {
    if (!user || businessId === activeBusinessId) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { activeBusinessId: businessId });
      // activeBusinessId updates via onSnapshot above automatically
    } catch (err) {
      console.error('Failed to switch business:', err);
      throw err;
    }
  }, [user, activeBusinessId]);

  // ── Force re-fetch ── (no-op with onSnapshot, kept for API compat)
  const refreshBusiness = useCallback(() => {}, []);

  // ── Create a new business ──
  const createBusiness = useCallback(async ({ name, address, currency: cur }) => {
    if (!user) return;
    const bizRef = await addDoc(collection(db, 'businesses'), {
      businessName: name,
      address: address || '',
      currency: cur || 'USD',
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    });
    const newBizId = bizRef.id;
    await updateDoc(doc(db, 'users', user.uid), {
      businesses: arrayUnion(newBizId),
      activeBusinessId: newBizId,
      role: 'owner',
    });
    return newBizId;
  }, [user]);

  const value = {
    // IDs & objects
    businessId: activeBusinessId || user?.uid || null,
    activeBusinessId: activeBusinessId || user?.uid || null,
    activeBusiness,
    businesses,
    businessData,

    // User profile fields
    userProfile,
    userRole,
    displayName,
    theme,
    notificationPrefs,

    // Business fields
    timezone,
    currency,
    billDefaults,
    businessHours,

    // Loading
    loading,

    // Actions
    switchBusiness,
    refreshBusiness,
    createBusiness,
  };

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}
