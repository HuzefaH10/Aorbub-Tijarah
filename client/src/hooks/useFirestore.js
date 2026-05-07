import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'entries'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setEntries(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addEntry = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'entries'), { ...data, userId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  const updateEntry = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'entries', id), data);
  }, [user]);

  const deleteEntry = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'entries', id));
  }, [user]);

  return { entries, loading, addEntry, updateEntry, deleteEntry };
}

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'), where('businessId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addProduct = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'products'), { ...data, businessId: user.uid, userId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  const updateProduct = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'products', id), data);
  }, [user]);

  const deleteProduct = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'products', id));
  }, [user]);

  return { products, loading, addProduct, updateProduct, deleteProduct };
}

export function useEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'events'), where('businessId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addEvent = useCallback(async (_, data) => {
    if (!user) return;
    await addDoc(collection(db, 'events'), { ...data, businessId: user.uid, userId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  const deleteEvent = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'events', id));
  }, [user]);

  const updateEvent = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'events', id), data);
  }, [user]);

  return { events, loading, addEvent, deleteEvent, updateEvent };
}

export function useStockLogs() {
  const [stockLogs, setStockLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'stockLogs'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStockLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addStockLog = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'stockLogs'), { ...data, userId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  const deleteStockLog = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'stockLogs', id));
  }, [user]);

  const updateStockLog = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'stockLogs', id), data);
  }, [user]);

  return { stockLogs, loading, addStockLog, deleteStockLog, updateStockLog };
}

export function useMilestones() {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'milestones'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMilestones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.date.localeCompare(b.date)));
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addMilestone = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'milestones'), { ...data, userId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  const deleteMilestone = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'milestones', id));
  }, [user]);

  return { milestones, loading, addMilestone, deleteMilestone };
}

export function useSettings() {
  const [settings, setSettings] = useState({ businessName: 'Supreme Sanitory' });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'settings', `profile_${user.uid}`), (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ businessName: 'Supreme Sanitory', ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const updateSettings = useCallback(async (data) => {
    if (!user) return;
    await setDoc(doc(db, 'settings', `profile_${user.uid}`), data, { merge: true });
  }, [user]);

  return { settings, loading, updateSettings };
}

export function useBills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'bills'), where('businessId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setBills(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addBill = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'bills'), { ...data, businessId: user.uid, createdAt: serverTimestamp() });
  }, [user]);

  return { bills, loading, addBill };
}

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'categories'), where('businessId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setCategories(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addCategory = useCallback(async (name) => {
    if (!user || !name.trim()) return;
    const existing = await getDocs(query(collection(db, 'categories'), where('businessId', '==', user.uid), where('name', '==', name.trim())));
    if (!existing.empty) return existing.docs[0].data().name;
    await addDoc(collection(db, 'categories'), { name: name.trim(), businessId: user.uid, createdAt: serverTimestamp() });
    return name.trim();
  }, [user]);

  return { categories, loading, addCategory };
}
