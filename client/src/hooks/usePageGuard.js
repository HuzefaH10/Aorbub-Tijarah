/**
 * usePageGuard — Redirects unauthorized users to home page with a toast.
 * Call at the top of any page component that requires a specific permission.
 *
 * Usage:
 *   usePageGuard('sales_analytics');
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from './useRole';

export function usePageGuard(feature) {
  const { hasPermission, loading } = useRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!hasPermission(feature)) {
      navigate('/', { replace: true, state: { accessDenied: true } });
    }
  }, [feature, hasPermission, loading, navigate]);
}
