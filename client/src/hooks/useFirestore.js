import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, getDocs, orderBy, setDoc
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { createDocument, updateDocument, setDocument } from '../utils/firestoreWrite';
import { validateProduct, validateSale, validateGeneric } from '../utils/validators';

export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setEntries([]); setLoading(false); return; }
    const q = query(collection(db, 'entries'), where('userId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setEntries(data);
      setLoading(false);
    }, (err) => { console.error('useEntries error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addEntry = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'entries'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Entry',
      summaryField: 'date',
      skipAudit: true, // entries are high-frequency, skip individual audit
    });
  }, [user, activeBusinessId]);

  const updateEntry = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'entries', id), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Entry',
      skipAudit: true,
    });
  }, [user, activeBusinessId]);

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
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setProducts([]); setLoading(false); return; }
    const q = query(collection(db, 'products'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => { console.error('useProducts error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addProduct = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'products'), data, {
      businessId: activeBusinessId,
      user,
      validator: validateProduct,
      collectionName: 'Product',
      summaryField: 'name',
    });
  }, [user, activeBusinessId]);

  const updateProduct = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'products', id), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Product',
      summaryField: 'name',
    });
  }, [user, activeBusinessId]);

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
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setEvents([]); setLoading(false); return; }
    const q = query(collection(db, 'events'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(data);
      setLoading(false);
    }, (err) => { console.error('useEvents error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addEvent = useCallback(async (_, data) => {
    if (!user) return;
    await createDocument(collection(db, 'events'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Event',
      summaryField: 'title',
    });
  }, [user, activeBusinessId]);

  const deleteEvent = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'events', id));
  }, [user]);

  const updateEvent = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'events', id), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Event',
      summaryField: 'title',
    });
  }, [user, activeBusinessId]);

  return { events, loading, addEvent, deleteEvent, updateEvent };
}

export function useStockLogs() {
  const [stockLogs, setStockLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setStockLogs([]); setLoading(false); return; }
    const q = query(collection(db, 'stockLogs'), where('userId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStockLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    }, (err) => { console.error('useStockLogs error:', err); setStockLogs([]); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addStockLog = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'stockLogs'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Stock Log',
      summaryField: 'date',
      skipAudit: true,
    });
  }, [user, activeBusinessId]);

  const deleteStockLog = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'stockLogs', id));
  }, [user]);

  const updateStockLog = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'stockLogs', id), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Stock Log',
      skipAudit: true,
    });
  }, [user, activeBusinessId]);

  return { stockLogs, loading, addStockLog, deleteStockLog, updateStockLog };
}

export function useEventTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setTemplates([]); setLoading(false); return; }
    const q = query(collection(db, 'templates'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }, (err) => { console.error('useEventTemplates error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addTemplate = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'templates'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Template',
      summaryField: 'name',
    });
  }, [user, activeBusinessId]);

  const deleteTemplate = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'templates', id));
  }, [user]);

  return { templates, loading, addTemplate, deleteTemplate };
}

export function useMilestones() {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setMilestones([]); setLoading(false); return; }
    const q = query(collection(db, 'milestones'), where('userId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMilestones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.date.localeCompare(b.date)));
      setLoading(false);
    }, (err) => { console.error('useMilestones error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addMilestone = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'milestones'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Milestone',
      summaryField: 'title',
    });
  }, [user, activeBusinessId]);

  const deleteMilestone = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'milestones', id));
  }, [user]);

  const updateMilestone = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'milestones', id), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Milestone',
      summaryField: 'title',
    });
  }, [user, activeBusinessId]);

  return { milestones, loading, addMilestone, deleteMilestone, updateMilestone };
}

export function useSettings() {
  const [settings, setSettings] = useState({ businessName: 'My Business' });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setLoading(false); return; }
    const unsubscribe = onSnapshot(doc(db, 'settings', `profile_${activeBusinessId}`), (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ businessName: 'My Business', ...docSnap.data() });
      }
      setLoading(false);
    }, (err) => { console.error('useSettings error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const updateSettings = useCallback(async (data) => {
    if (!user) return;
    await setDocument(doc(db, 'settings', `profile_${activeBusinessId}`), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Settings',
      summaryField: 'businessName',
    }, { merge: true });
  }, [user, activeBusinessId]);

  return { settings, loading, updateSettings };
}

export function useBills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setBills([]); setLoading(false); return; }
    const q = query(collection(db, 'bills'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setBills(data);
      setLoading(false);
    }, (err) => { console.error('useBills error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addBill = useCallback(async (data) => {
    if (!user) return;
    const ref = await createDocument(collection(db, 'bills'), data, {
      businessId: activeBusinessId,
      user,
      validator: validateSale,
      collectionName: 'Sale',
      summaryField: 'date',
    });
    return ref;
  }, [user, activeBusinessId]);

  return { bills, loading, addBill };
}

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setCategories([]); setLoading(false); return; }
    const q = query(collection(db, 'categories'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setCategories(data);
      setLoading(false);
    }, (err) => { console.error('useCategories error:', err); setLoading(false); });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addCategory = useCallback(async (name) => {
    if (!user || !name.trim()) return;
    const existing = await getDocs(query(collection(db, 'categories'), where('businessId', '==', activeBusinessId), where('name', '==', name.trim())));
    if (!existing.empty) return existing.docs[0].data().name;
    await createDocument(collection(db, 'categories'), { name: name.trim() }, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Category',
      summaryField: 'name',
      skipAudit: true,
    });
    return name.trim();
  }, [user, activeBusinessId]);

  return { categories, loading, addCategory };
}

export function useStockHistory(productId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !productId || !activeBusinessId) { setHistory([]); setLoading(false); return; }
    const q = query(
      collection(db, 'stockHistory'),
      where('businessId', '==', activeBusinessId),
      where('productId', '==', productId),
      orderBy('loadedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setLoading(false); });
    return unsubscribe;
  }, [user, productId, activeBusinessId]);

  return { history, loading };
}

export function useAddStockHistory() {
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  const addStockHistory = useCallback(async (data) => {
    if (!user) return;
    await createDocument(collection(db, 'stockHistory'), data, {
      businessId: activeBusinessId,
      user,
      collectionName: 'Stock History',
      summaryField: 'productId',
      skipAudit: true,
    });
  }, [user, activeBusinessId]);

  return addStockHistory;
}
