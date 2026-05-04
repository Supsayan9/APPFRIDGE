import type { InventoryItem, PushRegistration } from '@appfridge/shared';
import type { InventoryResponseItem, ProductLookupResponse, RecipesResponse } from './types';

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchInventory() {
  return request<InventoryResponseItem[]>('/inventory');
}

export function addInventoryItem(input: Omit<InventoryItem, 'id' | 'createdAt'>) {
  return request<InventoryResponseItem>('/inventory', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export function removeInventoryItem(id: string) {
  return request<void>(`/inventory/${id}`, { method: 'DELETE' });
}

export function lookupProduct(barcode: string) {
  const path = `/products/${encodeURIComponent(barcode)}`;
  return request<ProductLookupResponse>(path);
}

export function fetchRecipes() {
  return request<RecipesResponse>('/recipes');
}

export async function fetchAiRecipes(): Promise<RecipesResponse> {
  const response = await fetch(`${apiUrl}/recipes/ai`, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    let detail = `Помилка ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        detail = body.message;
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await response.json()) as RecipesResponse;
}

export function registerPushToken(payload: PushRegistration) {
  return request<{ ok: true }>('/push/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
