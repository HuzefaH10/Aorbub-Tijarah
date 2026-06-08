import { auth } from './firebase';
import { API_BASE_URL, STRIPE_PRICE_ID } from '../constants/pricing';

/**
 * Calls the backend to create a Stripe Checkout session,
 * then redirects the user to the Stripe hosted checkout page.
 */
export async function startCheckout(businessId) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const token = await user.getIdToken();

  const res = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      businessId,
      priceId: STRIPE_PRICE_ID,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create checkout session');
  }

  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');

  // Redirect to Stripe hosted checkout
  window.location.href = url;
}

/**
 * Fetches billing history (Stripe invoices) from the backend.
 */
export async function fetchBillingHistory(businessId) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const token = await user.getIdToken();

  const res = await fetch(
    `${API_BASE_URL}/api/stripe/billing-history?businessId=${encodeURIComponent(businessId)}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch billing history');
  }

  const data = await res.json();
  return data.invoices || [];
}
