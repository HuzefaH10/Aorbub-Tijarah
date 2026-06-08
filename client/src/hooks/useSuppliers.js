import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, onSnapshot,
  deleteDoc, doc
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { writeAuditLog } from './useAuditLog';
import { useRole } from './useRole';
import { isPermissionDenied } from '../utils/handleFirestoreError';
import { createDocument, updateDocument } from '../utils/firestoreWrite';
import { validateSupplier } from '../utils/validators';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
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
    }, (err) => {
      if (isPermissionDenied(err)) {
        setPermissionDenied(true);
      } else {
        console.error('useSuppliers error:', err);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [user, activeBusinessId]);

  const addSupplier = useCallback(async (data) => {
    if (!user) return;
    const ref = await createDocument(collection(db, 'suppliers'), data, {
      businessId: activeBusinessId,
      user,
      role,
      validator: validateSupplier,
      collectionName: 'Supplier',
      summaryField: 'name',
    });
    return ref.id;
  }, [user, activeBusinessId, role]);

  const updateSupplier = useCallback(async (id, data) => {
    if (!user) return;
    await updateDocument(doc(db, 'suppliers', id), data, {
      businessId: activeBusinessId,
      user,
      role,
      collectionName: 'Supplier',
      summaryField: 'name',
    });
  }, [user, role, activeBusinessId]);

  const deleteSupplier = useCallback(async (id, name) => {
    if (!user) return;
    await deleteDoc(doc(db, 'suppliers', id));
    await writeAuditLog(user, role, 'Supplier deleted', `Supplier deleted: ${name}`, 'Suppliers', activeBusinessId);
  }, [user, role, activeBusinessId]);

  return { suppliers, loading, permissionDenied, addSupplier, updateSupplier, deleteSupplier };
}
