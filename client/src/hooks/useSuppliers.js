import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, getDocs
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { writeAuditLog } from './useAuditLog';
import { useRole } from './useRole';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();
  const { role } = useRole();

  useEffect(() => {
    if (!user || !activeBusinessId) {
      setSuppliers([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'suppliers'), where('businessId', '==', activeBusinessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => a.name.localeCompare(b.name));
      setSuppliers(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addSupplier = useCallback(async (data) => {
    if (!user) return;
    const ref = await addDoc(collection(db, 'suppliers'), {
      ...data,
      businessId: activeBusinessId,
      createdAt: serverTimestamp()
    });
    await updateDoc(ref, { supplierId: ref.id });
    await writeAuditLog(user, role, 'Supplier added', `Supplier added: ${data.name}`, 'Suppliers', activeBusinessId);
    return ref.id;
  }, [user, activeBusinessId, role]);

  const updateSupplier = useCallback(async (id, data) => {
    if (!user) return;
    await updateDoc(doc(db, 'suppliers', id), data);
    await writeAuditLog(user, role, 'Supplier updated', `Supplier updated: ${data.name || id}`, 'Suppliers', activeBusinessId);
  }, [user, role, activeBusinessId]);

  const deleteSupplier = useCallback(async (id, name) => {
    if (!user) return;
    await deleteDoc(doc(db, 'suppliers', id));
    await writeAuditLog(user, role, 'Supplier deleted', `Supplier deleted: ${name}`, 'Suppliers', activeBusinessId);
  }, [user, role, activeBusinessId]);

  return { suppliers, loading, addSupplier, updateSupplier, deleteSupplier };
}
