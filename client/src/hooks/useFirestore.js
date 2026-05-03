import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
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
    const q = query(collection(db, 'products'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addProduct = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'products'), { ...data, userId: user.uid });
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
    const q = query(collection(db, 'events'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const addEvent = useCallback(async (data) => {
    if (!user) return;
    await addDoc(collection(db, 'events'), { ...data, userId: user.uid });
  }, [user]);

  const deleteEvent = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'events', id));
  }, [user]);

  return { events, loading, addEvent, deleteEvent };
}
