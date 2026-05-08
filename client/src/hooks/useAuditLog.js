import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp
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
 * Uses a single `where` clause with client-side sorting/filtering/pagination
 * to avoid requiring a Firestore composite index.
 */
export function useAuditLog() {
  const { user } = useAuth();
  const { role } = useRole();

  const [allLogs, setAllLogs] = useState([]);    // full fetched set
  const [logs, setLogs] = useState([]);           // current page slice
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    user: '',
    action: '',
    search: '',
  });

  const PAGE_SIZE = 25;

  // Fetch ALL logs for this business (simple single-field query — no index needed)
  const fetchAllLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'auditLog'),
        where('businessId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() || new Date(),
        };
      });

      // Sort newest first (client-side)
      results.sort((a, b) => b.timestamp - a.timestamp);
      setAllLogs(results);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) fetchAllLogs();
  }, [user, fetchAllLogs]);

  // Apply filters + pagination whenever allLogs, filters, or page change
  useEffect(() => {
    let filtered = [...allLogs];

    // Date filters
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => r.timestamp >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => r.timestamp <= to);
    }

    // User filter
    if (filters.user) {
      filtered = filtered.filter(r => r.userEmail === filters.user || r.userName === filters.user);
    }

    // Action filter
    if (filters.action) {
      filtered = filtered.filter(r => r.action === filters.action);
    }

    // Search filter
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        (r.details || '').toLowerCase().includes(s) ||
        (r.action || '').toLowerCase().includes(s) ||
        (r.affectedEntity || '').toLowerCase().includes(s)
      );
    }

    // Paginate
    const start = page * PAGE_SIZE;
    setLogs(filtered.slice(start, start + PAGE_SIZE));
  }, [allLogs, filters, page]);

  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    setPage(0);
  };

  const nextPage = () => setPage(p => p + 1);
  const prevPage = () => setPage(p => Math.max(0, p - 1));
  const refreshLogs = () => fetchAllLogs();

  // Get total filtered count for pagination
  const getFilteredCount = useCallback(() => {
    let filtered = [...allLogs];
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom); from.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => r.timestamp >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => r.timestamp <= to);
    }
    if (filters.user) filtered = filtered.filter(r => r.userEmail === filters.user || r.userName === filters.user);
    if (filters.action) filtered = filtered.filter(r => r.action === filters.action);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(r => (r.details || '').toLowerCase().includes(s) || (r.action || '').toLowerCase().includes(s));
    }
    return filtered.length;
  }, [allLogs, filters]);

  // Export filtered logs as CSV
  const exportCSV = useCallback(() => {
    let filtered = [...allLogs];
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom); from.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => r.timestamp >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => r.timestamp <= to);
    }
    if (filters.user) filtered = filtered.filter(r => r.userEmail === filters.user || r.userName === filters.user);
    if (filters.action) filtered = filtered.filter(r => r.action === filters.action);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(r => (r.details || '').toLowerCase().includes(s) || (r.action || '').toLowerCase().includes(s));
    }

    if (!filtered.length) return;

    const rows = filtered.map(r => ({
      Time: r.timestamp?.toISOString?.() || '',
      User: r.userName || '',
      Email: r.userEmail || '',
      Role: r.userRole || '',
      Action: r.action || '',
      Details: r.details || '',
      Entity: r.affectedEntity || '',
    }));

    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(','),
      ...rows.map(r => keys.map(k => `"${String(r[k]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allLogs, filters]);

  return {
    logs, loading, page, PAGE_SIZE,
    totalFiltered: getFilteredCount(),
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
