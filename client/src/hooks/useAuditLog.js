import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
  getCountFromServer, limit, startAfter, orderBy
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useRole } from './useRole';
import { useBusiness } from '../context/BusinessContext';


/**
 * writeAuditLog — Standalone function to log an action from anywhere.
 * @param {object} user - Firebase Auth user
 * @param {string} role - userRole
 * @param {string} action - action label
 * @param {string} details - description
 * @param {string|null} affectedEntity
 * @param {string|null} businessId - activeBusinessId from context (falls back to user.uid)
 */
export async function writeAuditLog(user, role, action, details, affectedEntity = null, businessId = null) {
  if (!user) return;
  try {
    await addDoc(collection(db, 'auditLog'), {
      businessId: businessId || user.uid,
      uid: user.uid,
      userName: user.email?.split('@')[0] || 'Unknown',
      userEmail: user.email || '',
      userRole: role || 'owner',
      action,
      details,
      affectedEntity,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}


/**
 * useAuditLog — Hook for reading and filtering the audit log.
 * Uses a single `where` clause with client-side sorting/filtering/pagination
 * to avoid requiring a Firestore composite index.
 */
export function useAuditLog() {
  const { user } = useAuth();
  const { role } = useRole();
  const { activeBusinessId } = useBusiness();


  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    user: '',
    action: '',
  });

  const [totalCount, setTotalCount] = useState(0);
  const [docStack, setDocStack] = useState([]);
  const [firstVisible, setFirstVisible] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);

  const PAGE_SIZE = 25;

  const buildBaseQuery = useCallback(() => {
    if (!user) return null;
    let constraints = [where('businessId', '==', activeBusinessId || user.uid)];
    
    if (filters.action) {
      constraints.push(where('action', '==', filters.action));
    }
    if (filters.user) {
      // NOTE: Firestore requires separate queries or 'in' for multiple fields, 
      // but assuming user filter is an exact match on userEmail for simplicity
      constraints.push(where('userEmail', '==', filters.user));
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      from.setHours(0, 0, 0, 0);
      constraints.push(where('timestamp', '>=', from));
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      // If we already have a >= constraint on timestamp, we can add <=
      constraints.push(where('timestamp', '<=', to));
    }

    return constraints;
  }, [user, activeBusinessId, filters]);

  const fetchPage = useCallback(async (actionType = 'init') => {
    const baseConstraints = buildBaseQuery();
    if (!baseConstraints) return;

    setLoading(true);
    try {
      if (actionType === 'init') {
        const countQ = query(collection(db, 'auditLog'), ...baseConstraints);
        const countSnap = await getCountFromServer(countQ).catch(() => ({ data: () => ({ count: 0 }) }));
        setTotalCount(countSnap.data().count);
      }

      let q;
      const baseQ = [collection(db, 'auditLog'), ...baseConstraints, orderBy('timestamp', 'desc'), limit(PAGE_SIZE)];

      if (actionType === 'next' && lastVisible) {
        q = query(...baseQ, startAfter(lastVisible));
      } else if (actionType === 'prev' && docStack.length > 1) {
        const newStack = [...docStack];
        newStack.pop();
        const prevPageStart = newStack.pop();
        q = query(...baseQ, startAfter(prevPageStart));
      } else {
        q = query(...baseQ);
        if (actionType === 'init') setDocStack([]);
      }

      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const firstDoc = snap.docs[0];
        const lastDoc = snap.docs[snap.docs.length - 1];
        
        if (actionType === 'next') setDocStack(prev => [...prev, firstVisible]);
        else if (actionType === 'prev') {
          const newStack = [...docStack];
          newStack.pop();
          setDocStack(newStack);
        } else if (actionType === 'init') {
          setDocStack([]);
        }

        setFirstVisible(firstDoc);
        setLastVisible(lastDoc);

        setLogs(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          timestamp: d.data().timestamp?.toDate?.() || new Date(),
        })));
      } else if (actionType === 'init') {
        setLogs([]);
        setFirstVisible(null);
        setLastVisible(null);
      }
    } catch (err) {
      console.error('Failed to fetch paginated audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [buildBaseQuery, lastVisible, firstVisible, docStack]);

  useEffect(() => {
    fetchPage('init');
    setPage(1);
  }, [buildBaseQuery]);

  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const nextPage = () => {
    setPage(p => p + 1);
    fetchPage('next');
  };
  const prevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchPage('prev');
    }
  };
  const refreshLogs = () => fetchPage('init');
  // Export filtered logs as CSV
  const exportCSV = useCallback(async () => {
    const baseConstraints = buildBaseQuery();
    if (!baseConstraints) return;
    const q = query(collection(db, 'auditLog'), ...baseConstraints, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: d.data().timestamp?.toDate?.() || new Date(),
    }));

    if (!results.length) return;

    const rows = results.map(r => ({
      Time: r.timestamp?.toISOString?.() || '',
      User: r.userName || '',
      Role: r.userRole || '',
      Action: r.action || '',
      Entity: r.affectedEntity || '',
      Details: r.details || ''
    }));

    const header = Object.keys(rows[0]).join(',');
    const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildBaseQuery]);

  return {
    logs,
    loading,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    totalCount,
    filters,
    applyFilters,
    nextPage,
    prevPage,
    refreshLogs,
    PAGE_SIZE,
    exportCSV
  };
}

/**
 * ACTION_TYPES — Canonical list of audit log actions.
 */
export const ACTION_TYPES = [
  'Bill created',
  'Bill deleted',
  'Product added',
  'Product edited',
  'Product deleted',
  'Stock loaded',
  'Category created',
  'Category deleted',
  'Settings changed',
  'Team member invited',
  'Team member removed',
  'Password changed',
  'Backup created',
  'Restore performed',
  'Login',
];
