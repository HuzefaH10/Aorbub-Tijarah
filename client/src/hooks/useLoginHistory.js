import { db, auth } from '../services/firebase';
import {
  collection, addDoc, serverTimestamp, query, where,
  orderBy, limit, getDocs, deleteDoc, doc, onSnapshot
} from 'firebase/firestore';

// ── UA Helpers ─────────────────────────────────────────────────────────────
export function detectDevice(ua) {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function detectBrowser(ua) {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/OPR|Opera/i.test(ua)) return 'Opera';
  if (/Trident/i.test(ua)) return 'Internet Explorer';
  if (/Edg/i.test(ua)) return 'Edge';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Unknown';
}

export function detectOS(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

// ── IP Lookup (best effort) ─────────────────────────────────────────────────
let cachedLocation = null;
export async function getLocation() {
  if (cachedLocation) return cachedLocation;
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('lookup failed');
    const data = await res.json();
    cachedLocation = { city: data.city || 'Unknown', country: data.country_name || 'Unknown' };
  } catch {
    cachedLocation = { city: 'Unknown', country: 'Unknown' };
  }
  return cachedLocation;
}

// ── Write Login Event ───────────────────────────────────────────────────────
export async function writeLoginHistory({ uid, businessId, status }) {
  const ua = navigator.userAgent;
  const location = await getLocation();

  const ref = await addDoc(collection(db, 'loginHistory'), {
    uid,
    businessId: businessId || null,
    timestamp: serverTimestamp(),
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    os: detectOS(ua),
    location,
    status  // 'success' | 'failed'
  });

  // Auto-delete entries beyond last 30
  try {
    const q = query(
      collection(db, 'loginHistory'),
      where('uid', '==', uid),
      orderBy('timestamp', 'desc'),
      limit(31)
    );
    const snap = await getDocs(q);
    const docs = snap.docs;
    if (docs.length > 30) {
      const toDelete = docs.slice(30);
      await Promise.all(toDelete.map(d => deleteDoc(doc(db, 'loginHistory', d.id))));
    }
  } catch {
    // non-critical
  }

  return ref.id;
}

// ── React hook to subscribe to login history ────────────────────────────────
import { useState, useEffect } from 'react';

export function useLoginHistory(uid) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'loginHistory'),
      where('uid', '==', uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { history, loading };
}
