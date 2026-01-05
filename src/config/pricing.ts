/**
 * Pricing tiers and configuration
 */

export interface PricingTier {
  id: 'starter' | 'pro' | 'premium';
  name: string;
  price: number; // SEK
  credits: number;
  maxCategories: number; // Max AI categories user can select
  features: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 79, // SEK
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
    price: 199, // SEK
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
    price: 499, // SEK
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

export function getPricingTier(tierId: string): PricingTier | undefined {
  return PRICING_TIERS.find(tier => tier.id === tierId);
}

export function getCreditsForTier(tierId: string): number {
  const tier = getPricingTier(tierId);
  return tier?.credits || 0;
}
