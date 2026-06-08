/**
 * handleFirestoreError — Shared error handler for Firestore operations.
 *
 * If the error is a permission-denied error (from security rules blocking
 * free users from Pro collections), it triggers the upgrade modal.
 * Otherwise, it calls an optional fallback for generic error handling.
 *
 * Usage:
 *   import { handleFirestoreError } from '../utils/handleFirestoreError';
 *
 *   // In an onSnapshot error callback:
 *   onSnapshot(q, onSuccess, (err) => {
 *     handleFirestoreError(err, showUpgradeModal, 'Invoicing');
 *   });
 *
 *   // In a try/catch:
 *   try { ... } catch (err) {
 *     handleFirestoreError(err, showUpgradeModal, 'Expenses', showToast);
 *   }
 *
 * @param {Error} error - The Firestore error object
 * @param {function} requirePro - Function that triggers the upgrade modal, receives featureName
 * @param {string} featureName - Human-readable name of the Pro feature (e.g. "Invoicing")
 * @param {function} [showToast] - Optional toast function for non-permission errors
 */
export function handleFirestoreError(error, requirePro, featureName, showToast) {
  if (
    error?.code === 'permission-denied' ||
    error?.message?.includes('permission-denied') ||
    error?.message?.includes('Missing or insufficient permissions')
  ) {
    if (typeof requirePro === 'function') {
      requirePro(featureName);
    }
  } else {
    console.error(`[${featureName}] Firestore error:`, error);
    if (typeof showToast === 'function') {
      showToast(error?.message || 'Something went wrong. Please try again.', 'error');
    }
  }
}

/**
 * isPermissionDenied — Quick check if an error is a Firestore permission error.
 * Useful in components that need to distinguish permission errors from other failures.
 */
export function isPermissionDenied(error) {
  return (
    error?.code === 'permission-denied' ||
    error?.message?.includes('permission-denied') ||
    error?.message?.includes('Missing or insufficient permissions')
  );
}
