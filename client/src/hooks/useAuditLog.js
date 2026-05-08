import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, addDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useRole } from './useRole';

/**
 * writeAuditLog — Standalone function to log an action from anywhere.
 * Import this directly in components that need to log actions.
 */
export async function writeAuditLog(user, role, action, details, affectedEntity = null) {
  if (!user) return;
  try {
    await addDoc(collection(db, 'auditLog'), {
      businessId: user.uid,
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
 */
export function useAuditLog() {
  const { user } = useAuth();
  const { role } = useRole();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [lastDocs, setLastDocs] = useState([]); // cursor stack for pagination
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    user: '',
    action: '',
    search: '',
  });

  const PAGE_SIZE = 25;

  // Fetch logs with filters and pagination
  const fetchLogs = useCallback(async (pageNum = 0, currentFilters = filters) => {
    if (!user) return;
    setLoading(true);
    try {
      let constraints = [
        where('businessId', '==', user.uid),
        orderBy('timestamp', 'desc'),
      ];

      // Date filters
      if (currentFilters.dateFrom) {
        const from = new Date(currentFilters.dateFrom);
        from.setHours(0, 0, 0, 0);
        constraints.push(where('timestamp', '>=', Timestamp.fromDate(from)));
      }
      if (currentFilters.dateTo) {
        const to = new Date(currentFilters.dateTo);
        to.setHours(23, 59, 59, 999);
        constraints.push(where('timestamp', '<=', Timestamp.fromDate(to)));
      }

      // Build base query
      let q = query(collection(db, 'auditLog'), ...constraints, limit(PAGE_SIZE));

      // Pagination cursor
      if (pageNum > 0 && lastDocs[pageNum - 1]) {
        q = query(collection(db, 'auditLog'), ...constraints, startAfter(lastDocs[pageNum - 1]), limit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      let results = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() || new Date(),
        };
      });

      // Client-side filters (user, action, search) since Firestore can't combine these with orderBy
      if (currentFilters.user) {
        results = results.filter(r => r.userEmail === currentFilters.user || r.userName === currentFilters.user);
      }
      if (currentFilters.action) {
        results = results.filter(r => r.action === currentFilters.action);
      }
      if (currentFilters.search) {
        const s = currentFilters.search.toLowerCase();
        results = results.filter(r =>
          (r.details || '').toLowerCase().includes(s) ||
          (r.action || '').toLowerCase().includes(s) ||
          (r.affectedEntity || '').toLowerCase().includes(s)
        );
      }

      // Save cursor for next page
      if (snap.docs.length > 0) {
        setLastDocs(prev => {
          const updated = [...prev];
          updated[pageNum] = snap.docs[snap.docs.length - 1];
          return updated;
        });
      }

      setLogs(results);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [user, filters, lastDocs]);

  // Initial load
  useEffect(() => {
    if (user) fetchLogs(0, filters);
  }, [user]);

  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    setLastDocs([]);
    fetchLogs(0, newFilters);
  };

  const nextPage = () => fetchLogs(page + 1, filters);
  const prevPage = () => { if (page > 0) fetchLogs(page - 1, filters); };
  const refreshLogs = () => { setLastDocs([]); fetchLogs(0, filters); };

  // Export filtered logs as CSV
  const exportCSV = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch all matching logs (up to 1000)
      let constraints = [
        where('businessId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(1000),
      ];

      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        constraints.push(where('timestamp', '>=', Timestamp.fromDate(from)));
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        constraints.push(where('timestamp', '<=', Timestamp.fromDate(to)));
      }

      const q = query(collection(db, 'auditLog'), ...constraints);
      const snap = await getDocs(q);
      let results = snap.docs.map(d => {
        const data = d.data();
        return {
          Time: data.timestamp?.toDate?.()?.toISOString() || '',
          User: data.userName || '',
          Email: data.userEmail || '',
          Role: data.userRole || '',
          Action: data.action || '',
          Details: data.details || '',
          Entity: data.affectedEntity || '',
        };
      });

      if (filters.user) results = results.filter(r => r.Email === filters.user || r.User === filters.user);
      if (filters.action) results = results.filter(r => r.Action === filters.action);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        results = results.filter(r => r.Details.toLowerCase().includes(s) || r.Action.toLowerCase().includes(s));
      }

      if (!results.length) return;

      const keys = Object.keys(results[0]);
      const csv = [
        keys.join(','),
        ...results.map(r => keys.map(k => `"${String(r[k]).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export audit log:', err);
    }
  }, [user, filters]);

  return {
    logs, loading, page, PAGE_SIZE,
    filters, applyFilters,
    nextPage, prevPage, refreshLogs,
    exportCSV,
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
