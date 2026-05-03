export type InventoryStatus = 'fresh' | 'expiring' | 'expired';
export type ProductCategory =
  | 'Молочні продукти'
  | 'Сири'
  | 'Йогурти та десерти'
  | 'Соуси'
  | "М'ясо"
  | 'Риба та морепродукти'
  | 'Ковбаси'
  | 'Овочі'
  | 'Фрукти'
  | 'Напої'
  | 'Снеки'
  | 'Солодощі'
  | 'Крупи та макарони'
  | 'Хліб та випічка'
  | 'Заморожені продукти'
  | 'Консерви'
  | 'Приправи'
  | 'Готові страви'
  | 'Інше';

export interface Product {
  barcode: string;
  name: string;
  brand?: string;
  category?: ProductCategory;
  imageUrl?: string;
  lookupStatus?: 'catalog' | 'fallback';
  lookupMessage?: string;
}

export interface InventoryItem extends Product {
  id: string;
  expirationDate: string;
  quantity: number;
  location: 'fridge' | 'freezer' | 'pantry';
  createdAt: string;
}

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
}

export interface RecipeSuggestion {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  urgency: 'high' | 'medium';
  /** Локальні шаблони vs відповідь AI на бекенді */
  source?: 'rules' | 'ai';
}

export interface InventoryInsight {
  daysLeft: number | null;
  status: InventoryStatus;
}
