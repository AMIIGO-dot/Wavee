/**
 * Pricing tiers and configuration
 */

export interface PricingTier {
  id: 'starter' | 'pro' | 'premium';
  name: string;
  price: number;
  currency: 'sek' | 'usd';
  credits: number;
  maxCategories: number; // Max AI categories user can select
  features: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

export const PRICING_TIERS_SEK: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 79,
    currency: 'sek',
    credits: 30,
    maxCategories: 1,
    features: [
      '30 meddelanden',
      '1 AI-kategori',
      'Väderprognoser',
      'GPS-positionering',
      'Närliggande platser',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 199,
    currency: 'sek',
    credits: 100,
    maxCategories: 3,
    features: [
      '100 meddelanden',
      '3 AI-kategorier',
      'Alla Starter-funktioner',
      'Prioriterad support',
      'Avancerad navigation',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 499,
    currency: 'sek',
    credits: 350,
    maxCategories: 999,
    features: [
      '350 meddelanden',
      'Obegränsade AI-kategorier',
      'Alla Pro-funktioner',
      '24/7 prioriterad support',
      'Företagslicens',
    ],
  },
];

export const PRICING_TIERS_USD: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 9,
    currency: 'usd',
    credits: 30,
    maxCategories: 1,
    features: [
      '30 messages',
      '1 AI category',
      'Weather forecasts',
      'GPS positioning',
      'Nearby places',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 22,
    currency: 'usd',
    credits: 100,
    maxCategories: 3,
    features: [
      '100 messages',
      '3 AI categories',
      'All Starter features',
      'Priority support',
      'Advanced navigation',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 55,
    currency: 'usd',
    credits: 350,
    maxCategories: 999,
    features: [
      '350 messages',
      'Unlimited AI categories',
      'All Pro features',
      '24/7 priority support',
      'Business license',
    ],
  },
];

// Default export for backwards compatibility (Swedish)
export const PRICING_TIERS = PRICING_TIERS_SEK;

export const CREDIT_COSTS = {
  incoming_sms: 1, // Cost per incoming message
  outgoing_sms: 1, // Cost per outgoing message
  ai_query: 1, // Cost per AI interaction
  weather_query: 0, // Weather is free (included in message cost)
  place_search: 0, // Place search is free (included in message cost)
};

/**
 * Free trial credits given to new users after opt-in
 */
export const FREE_TRIAL_CREDITS = 3; // 3 free conversations to test the service

/**
 * Get pricing tiers for a specific currency
 */
export function getPricingTiersForCurrency(currency: 'sek' | 'usd'): PricingTier[] {
  return currency === 'usd' ? PRICING_TIERS_USD : PRICING_TIERS_SEK;
}

/**
 * Get pricing tiers for a specific language
 */
export function getPricingTiersForLanguage(language: 'sv' | 'en'): PricingTier[] {
  return language === 'en' ? PRICING_TIERS_USD : PRICING_TIERS_SEK;
}

export function getPricingTier(tierId: string): PricingTier | undefined {
  return PRICING_TIERS.find(tier => tier.id === tierId);
}

export function getCreditsForTier(tierId: string): number {
  const tier = getPricingTier(tierId);
  return tier?.credits || 0;
}
