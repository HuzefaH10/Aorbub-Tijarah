import { useState, useEffect } from 'react';
import { db, storage } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, deleteDoc, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { writeAuditLog } from './useAuditLog';
import { useRole } from './useRole';
import { isPermissionDenied } from '../utils/handleFirestoreError';

export function useExpenses() {
  const { activeBusinessId } = useBusiness();
  const { user } = useAuth();
  const { role } = useRole();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!activeBusinessId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'expenses'),
      where('businessId', '==', activeBusinessId),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      }));
      setExpenses(data);
      setLoading(false);
    }, (err) => {
      if (isPermissionDenied(err)) {
        setPermissionDenied(true);
      } else {
        console.error("Error fetching expenses:", err);
      }
      setError(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeBusinessId]);

  const addExpense = async (expenseData, file = null) => {
    try {
      let receiptUrl = null;
      if (file) {
        const fileRef = ref(storage, `expenses/${activeBusinessId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        receiptUrl = await getDownloadURL(snapshot.ref);
      }

      const docRef = await addDoc(collection(db, 'expenses'), {
        ...expenseData,
        businessId: activeBusinessId,
        receiptUrl,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        amount: parseFloat(expenseData.amount) || 0,
        supplierId: expenseData.supplierId || null,
        status: expenseData.status || 'paid' // Need to track paid/unpaid status for suppliers
      });

      await updateDoc(docRef, { expenseId: docRef.id });

      // Audit Log
      await writeAuditLog(user, role, 'Expense Recorded', `Recorded expense: ${expenseData.category} - ${expenseData.amount}`, 'Expenses', activeBusinessId);
      
      return docRef.id;
    } catch (err) {
      console.error("Error adding expense:", err);
      throw err;
    }
  };

  const updateExpense = async (id, updates, file = null) => {
    try {
      let receiptUrl = updates.receiptUrl;
      if (file) {
        const fileRef = ref(storage, `expenses/${activeBusinessId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        receiptUrl = await getDownloadURL(snapshot.ref);
      }

      await updateDoc(doc(db, 'expenses', id), {
        ...updates,
        receiptUrl,
        amount: parseFloat(updates.amount) || 0,
        supplierId: updates.supplierId !== undefined ? updates.supplierId : null,
        status: updates.status !== undefined ? updates.status : 'paid'
      });

      await writeAuditLog(user, role, 'Expense Updated', `Updated expense: ${updates.category} - ${updates.amount}`, 'Expenses', activeBusinessId);
    } catch (err) {
      console.error("Error updating expense:", err);
      throw err;
    }
  };

  const deleteExpense = async (id, category, amount) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
      await writeAuditLog(user, role, 'Expense Deleted', `Deleted expense: ${category} - ${amount}`, 'Expenses', activeBusinessId);
    } catch (err) {
      console.error("Error deleting expense:", err);
      throw err;
    }
  };

  return {
    expenses,
    loading,
    error,
    permissionDenied,
    addExpense,
    updateExpense,
    deleteExpense
  };
}
