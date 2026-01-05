/**
 * AI Category configuration
 * Defines available categories and their limits per tier
 */

export interface AICategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AI_CATEGORIES: AICategory[] = [
  {
    id: 'outdoor',
    name: 'Friluftsliv & Överlevnad',
    description: 'Väderprognoser, GPS-navigation, överlevnadsråd, djur & natur',
    icon: '🏕️',
  },
  {
    id: 'construction',
    name: 'Bygg & Hantverk',
    description: 'Byggfrågor, verktyg, material, praktiska lösningar',
    icon: '🔨',
  },
  {
    id: 'gardening',
    name: 'Trädgård & Odling',
    description: 'Växter, skötsel, säsong, odlingstips',
    icon: '🌱',
  },
  {
    id: 'travel',
    name: 'Resa & Kultur',
    description: 'Resmål, språk, kultur, praktiska resetips',
    icon: '✈️',
  },
  {
    id: 'tech',
    name: 'Teknik & IT',
    description: 'Felsökning, programmering, mjukvara, hårdvara',
    icon: '💻',
  },
  {
    id: 'cooking',
    name: 'Mat & Recept',
    description: 'Matlagning, ingredienser, recept, mattips',
    icon: '🍳',
  },
  {
    id: 'health',
    name: 'Hälsa & Träning',
    description: 'Övningar, nutrition, allmänna hälsotips (ej medicinska råd)',
    icon: '💪',
  },
  {
    id: 'finance',
    name: 'Ekonomi & Juridik',
    description: 'Grundläggande råd om ekonomi och juridik (ej professionell rådgivning)',
    icon: '💰',
  },
];

export const CATEGORY_LIMITS = {
  starter: 1,
  pro: 3,
  premium: 999, // Unlimited
};

export function getCategoryById(categoryId: string): AICategory | undefined {
  return AI_CATEGORIES.find(cat => cat.id === categoryId);
}

export function getMaxCategoriesForTier(tierId: string): number {
  return CATEGORY_LIMITS[tierId as keyof typeof CATEGORY_LIMITS] || 1;
}
