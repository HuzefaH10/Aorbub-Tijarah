import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  doc, getDoc, setDoc, addDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from './AuthContext';

const BusinessContext = createContext();

export function useBusiness() {
  return useContext(BusinessContext);
}

export function BusinessProvider({ children }) {
  const { user } = useAuth();

  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [businesses, setBusinesses] = useState([]);   // [{ id, name, role, currency, address }]
  const [loading, setLoading] = useState(true);

  // Listen to user doc for businesses + activeBusinessId
  useEffect(() => {
    if (!user) {
      setActiveBusinessId(null);
      setBusinesses([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (!snap.exists()) {
        // First ever login — bootstrap business from user.uid
        const defaultId = user.uid;
        await setDoc(doc(db, 'users', user.uid), {
          businesses: [defaultId],
          activeBusinessId: defaultId,
        }, { merge: true });
        setActiveBusinessId(defaultId);
        setBusinesses([{ id: defaultId, name: 'My Business', role: 'owner', currency: 'USD', address: '' }]);
        setLoading(false);
        return;
      }

      const data = snap.data();
      const bizIds = data.businesses || [user.uid];
      const activeBizId = data.activeBusinessId || user.uid;

      setActiveBusinessId(activeBizId);

      // Fetch all business docs
      const bizDocs = await Promise.all(
        bizIds.map(async (id) => {
          try {
            const bizSnap = await getDoc(doc(db, 'businesses', id));
            return {
              id,
              name: bizSnap.exists() ? (bizSnap.data().businessName || bizSnap.data().name || 'Unnamed Business') : 'My Business',
              currency: bizSnap.exists() ? (bizSnap.data().currency || 'USD') : 'USD',
              address: bizSnap.exists() ? (bizSnap.data().address || '') : '',
              role: data.role || 'owner',
            };
          } catch {
            return { id, name: 'My Business', currency: 'USD', address: '', role: 'owner' };
          }
        })
      );

      setBusinesses(bizDocs);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Switch active business — updates Firestore + context reactively
  const switchBusiness = useCallback(async (businessId, businessName) => {
    if (!user || businessId === activeBusinessId) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { activeBusinessId: businessId });
      setActiveBusinessId(businessId);
      return businessName;
    } catch (err) {
      console.error('Failed to switch business:', err);
      throw err;
    }
  }, [user, activeBusinessId]);

  // Create a new business and auto-switch to it
  const createBusiness = useCallback(async ({ name, address, currency }) => {
    if (!user) return;
    const bizRef = await addDoc(collection(db, 'businesses'), {
      businessName: name,
      address: address || '',
      currency: currency || 'USD',
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    });
    const newBizId = bizRef.id;

    // Add to user's businesses list + set as active
    await updateDoc(doc(db, 'users', user.uid), {
      businesses: arrayUnion(newBizId),
      activeBusinessId: newBizId,
      role: 'owner',
    });

    setActiveBusinessId(newBizId);
    return newBizId;
  }, [user]);

  const activeBusiness = businesses.find(b => b.id === activeBusinessId) || businesses[0];

  const value = {
    activeBusinessId: activeBusinessId || user?.uid,
    activeBusiness,
    businesses,
    loading,
    switchBusiness,
    createBusiness,
  };

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}
