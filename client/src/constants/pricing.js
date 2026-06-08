/**
 * Stripe pricing configuration.
 * 
 * STRIPE_PRICE_ID: Create a Product + Price in the Stripe Dashboard, then paste the price ID here.
 * PRO_PRICE_DISPLAY: The human-readable price shown throughout the app.
 * 
 * To set up:
 *   1. Go to https://dashboard.stripe.com/products → Create Product
 *   2. Name: "Aorbub Tijarah Pro", set your price (e.g. AED 49/month)
 *   3. Copy the Price ID (starts with "price_") and paste below
 */

// Replace with your actual Stripe Price ID after creating the product
export const STRIPE_PRICE_ID = 'price_REPLACE_ME';

// Display string used across the app — update after deciding pricing
export const PRO_PRICE_DISPLAY = 'AED 49 / month';

// The backend API base URL for Stripe operations
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
