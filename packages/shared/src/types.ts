export type InventoryStatus = 'fresh' | 'expiring' | 'expired';

export interface Product {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
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
}

export interface InventoryInsight {
  daysLeft: number;
  status: InventoryStatus;
}
