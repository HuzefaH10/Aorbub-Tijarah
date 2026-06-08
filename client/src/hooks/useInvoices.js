import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, getDoc, setDoc
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { isPermissionDenied } from '../utils/handleFirestoreError';

/**
 * useInvoices — CRUD hook for the invoices collection.
 * Documents are scoped by businessId from BusinessContext.
 */
export function useInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  useEffect(() => {
    if (!user || !activeBusinessId) { setInvoices([]); setLoading(false); return; }
    const q = query(collection(db, 'invoices'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.invoiceNumber || 0) - (a.invoiceNumber || 0));
      setInvoices(data);
      setLoading(false);
    }, (err) => {
      if (isPermissionDenied(err)) {
        setPermissionDenied(true);
      } else {
        console.error('useInvoices error:', err);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addInvoice = useCallback(async (data) => {
    if (!user || !activeBusinessId) return null;
    const ref = await addDoc(collection(db, 'invoices'), {
      ...data,
      businessId: activeBusinessId,
      createdAt: serverTimestamp(),
    });
    return ref;
  }, [user, activeBusinessId]);

  const updateInvoice = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'invoices', id), { ...data, updatedAt: serverTimestamp() });
  }, [user]);

  const deleteInvoice = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'invoices', id));
  }, [user]);

  return { invoices, loading, permissionDenied, addInvoice, updateInvoice, deleteInvoice };
}

/**
 * useInvoiceCounter — Auto-incrementing invoice number per business.
 * Stored in counters/{businessId} → { invoiceNumber: N }
 */
export function useInvoiceCounter() {
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();

  const getNextInvoiceNumber = useCallback(async () => {
    if (!user || !activeBusinessId) return 1;
    const counterRef = doc(db, 'counters', `invoice_${activeBusinessId}`);
    const snap = await getDoc(counterRef);
    const current = snap.exists() ? (snap.data().invoiceNumber || 0) : 0;
    const next = current + 1;
    await setDoc(counterRef, { invoiceNumber: next, businessId: activeBusinessId }, { merge: true });
    return next;
  }, [user, activeBusinessId]);

  return { getNextInvoiceNumber };
}
