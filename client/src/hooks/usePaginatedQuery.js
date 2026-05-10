import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, limit, startAfter, getDocs, orderBy, getCountFromServer, where } from 'firebase/firestore';

export function usePaginatedQuery(collectionName, pageSize, baseConstraints = [], orderField = 'createdAt', orderDir = 'desc') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Pagination cursors
  const [docStack, setDocStack] = useState([]); // Array of first visible docs for each page (to go back)
  const [lastVisible, setLastVisible] = useState(null); // Last doc of current page (to go forward)
  const [firstVisible, setFirstVisible] = useState(null);

  // 1. Fetch total count
  const fetchTotalCount = useCallback(async () => {
    try {
      const q = query(collection(db, collectionName), ...baseConstraints);
      const snapshot = await getCountFromServer(q);
      setTotalCount(snapshot.data().count);
    } catch (err) {
      console.error(`Error counting ${collectionName}:`, err);
    }
  }, [collectionName, JSON.stringify(baseConstraints)]);

  // 2. Fetch page data
  const fetchPage = useCallback(async (action = 'init') => {
    setLoading(true);
    setError('');
    try {
      let q;
      const baseQ = [collection(db, collectionName), ...baseConstraints, orderBy(orderField, orderDir), limit(pageSize)];
      
      if (action === 'next' && lastVisible) {
        q = query(...baseQ, startAfter(lastVisible));
      } else if (action === 'prev' && docStack.length > 1) {
        // Pop current page's start cursor, and previous page's start cursor
        const newStack = [...docStack];
        newStack.pop(); // Remove current page
        const prevPageStart = newStack.pop(); // Get previous page start
        q = query(...baseQ, startAfter(prevPageStart));
      } else {
        // init or first page
        q = query(...baseQ);
        setDocStack([]);
      }

      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const firstDoc = snap.docs[0];
        const lastDoc = snap.docs[snap.docs.length - 1];
        
        if (action === 'next') {
          setDocStack(prev => [...prev, firstVisible]);
        } else if (action === 'prev') {
          // the pop is already handled above conceptually, but we rebuild stack carefully
          const newStack = [...docStack];
          newStack.pop();
          setDocStack(newStack);
        } else if (action === 'init') {
          setDocStack([]);
        }

        setFirstVisible(firstDoc);
        setLastVisible(lastDoc);
        
        const docs = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          timestamp: d.data().timestamp?.toDate?.() || new Date(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          paidAt: d.data().paidAt?.toDate?.() || null
        }));
        
        setData(docs);
      } else if (action === 'init') {
        setData([]);
        setFirstVisible(null);
        setLastVisible(null);
      }
    } catch (err) {
      console.error(`Error fetching ${collectionName}:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [collectionName, pageSize, orderField, orderDir, lastVisible, firstVisible, docStack, JSON.stringify(baseConstraints)]);

  // Initial load
  useEffect(() => {
    fetchTotalCount();
    fetchPage('init');
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTotalCount, JSON.stringify(baseConstraints)]);

  const nextPage = () => {
    if (currentPage * pageSize < totalCount) {
      setCurrentPage(p => p + 1);
      fetchPage('next');
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
      fetchPage('prev');
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    data,
    loading,
    error,
    currentPage,
    totalPages,
    totalCount,
    nextPage,
    prevPage,
    refresh: () => fetchPage('init')
  };
}
