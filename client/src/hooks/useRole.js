import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

/**
 * Permission matrix for role-based access control.
 * true = allowed, false = denied
 */
const PERMISSIONS = {
  owner: {
    'stock_entry':        true,
    'billing':            true,
    'inventory_view':     true,
    'inventory_edit':     true,
    'load_stock':         true,
    'sales_analytics':    true,
    'calendar':           true,
    'settings_profile':   true,
    'settings_business':  true,
    'settings_team':      true,
    'settings_security':  true,
    'profit_optimization': true,
  },
  admin: {
    'stock_entry':        true,
    'billing':            true,
    'inventory_view':     true,
    'inventory_edit':     true,
    'load_stock':         true,
    'sales_analytics':    true,
    'calendar':           true,
    'settings_profile':   true,
    'settings_business':  false,
    'settings_team':      false,
    'settings_security':  true,
    'profit_optimization': true,
  },
  staff: {
    'stock_entry':        true,
    'billing':            true,
    'inventory_view':     true,
    'inventory_edit':     false,
    'load_stock':         true,
    'sales_analytics':    false,
    'calendar':           true,
    'settings_profile':   true,
    'settings_business':  false,
    'settings_team':      false,
    'settings_security':  false,
    'profit_optimization': false,
  },
};

/**
 * useRole — Returns the current user's role and permission helpers.
 * 
 * When a user signs up or hasn't been assigned a role yet, they default to 'owner'
 * (since the first user is always the business owner).
 */
export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState('owner');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRole('owner'); setLoading(false); return; }

    const fetchRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().role) {
          setRole(userDoc.data().role);
        } else {
          // First-time user — default to owner
          setRole('owner');
        }
      } catch (err) {
        console.error('Failed to fetch user role:', err);
        setRole('owner');
      } finally {
        setLoading(false);
      }
    };
    fetchRole();
  }, [user]);

  const hasPermission = useCallback((feature) => {
    const rolePerms = PERMISSIONS[role];
    if (!rolePerms) return false;
    return rolePerms[feature] === true;
  }, [role]);

  const isOwner = useMemo(() => role === 'owner', [role]);
  const isAdmin = useMemo(() => role === 'admin', [role]);
  const isStaff = useMemo(() => role === 'staff', [role]);

  return { role, loading, hasPermission, isOwner, isAdmin, isStaff };
}

/**
 * useTeam — Manage the team members and invites for the current business.
 */
export function useTeam() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch team members — users who belong to this business
  useEffect(() => {
    if (!user) { setMembers([]); setInvites([]); setLoading(false); return; }

    // Listen to team members
    const membersQ = query(collection(db, 'teamMembers'), where('businessId', '==', user.uid));
    const unsubMembers = onSnapshot(membersQ, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Listen to pending invites
    const invitesQ = query(collection(db, 'invites'), where('businessId', '==', user.uid));
    const unsubInvites = onSnapshot(invitesQ, (snapshot) => {
      setInvites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);
    return () => { unsubMembers(); unsubInvites(); };
  }, [user]);

  const sendInvite = useCallback(async (email, role) => {
    if (!user || !email) return;

    // Check if already invited
    const existingQ = query(
      collection(db, 'invites'),
      where('businessId', '==', user.uid),
      where('email', '==', email.toLowerCase().trim())
    );
    const existing = await getDocs(existingQ);
    if (!existing.empty) {
      throw new Error('This email has already been invited');
    }

    // Check if already a member
    const memberQ = query(
      collection(db, 'teamMembers'),
      where('businessId', '==', user.uid),
      where('email', '==', email.toLowerCase().trim())
    );
    const memberCheck = await getDocs(memberQ);
    if (!memberCheck.empty) {
      throw new Error('This user is already a team member');
    }

    await addDoc(collection(db, 'invites'), {
      businessId: user.uid,
      email: email.toLowerCase().trim(),
      role,
      status: 'pending',
      invitedBy: user.uid,
      createdAt: serverTimestamp(),
    });
  }, [user]);

  const cancelInvite = useCallback(async (inviteId) => {
    if (!user) return;
    await deleteDoc(doc(db, 'invites', inviteId));
  }, [user]);

  const removeMember = useCallback(async (memberId, memberUid) => {
    if (!user) return;
    // Remove from teamMembers collection
    await deleteDoc(doc(db, 'teamMembers', memberId));
    // Clear role from user document
    if (memberUid) {
      await updateDoc(doc(db, 'users', memberUid), { role: null, businessId: null });
    }
  }, [user]);

  const updateMemberRole = useCallback(async (memberId, newRole) => {
    if (!user) return;
    await updateDoc(doc(db, 'teamMembers', memberId), { role: newRole });
  }, [user]);

  return { members, invites, loading, sendInvite, cancelInvite, removeMember, updateMemberRole };
}
