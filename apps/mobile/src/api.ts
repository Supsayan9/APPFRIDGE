import type { InventoryItem, PushRegistration } from '@appfridge/shared';
import type { InventoryResponseItem, ProductLookupResponse, RecipesResponse } from './types';

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

type AiErrorCode = 'ai_unconfigured' | 'ai_invalid_key' | 'ai_rate_limited' | 'ai_service_unavailable' | 'ai_failed';
type ExpiryScanErrorCode = AiErrorCode | 'expiry_not_found' | 'invalid_image' | 'product_name_not_found';

export class AiRequestError extends Error {
  code?: ExpiryScanErrorCode;
  status: number;

  constructor(message: string, status: number, code?: ExpiryScanErrorCode) {
    super(message);
    this.name = 'AiRequestError';
    this.status = status;
    this.code = code;
  }
}

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

export function updateInventoryItem(
  id: string,
  patch: Partial<Pick<InventoryItem, 'quantity' | 'location'>>
) {
  return request<InventoryResponseItem>(`/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function lookupProduct(barcode: string) {
  const path = `/products/${encodeURIComponent(barcode)}`;
  return request<ProductLookupResponse>(path);
}

export function fetchRecipes() {
  return request<RecipesResponse>('/recipes');
}

export async function fetchAiRecipes(itemIds?: string[]): Promise<RecipesResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/recipes/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        itemIds: Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : undefined
      })
    });
  } catch {
    throw new AiRequestError('Не вдалося зʼєднатися з сервером. Перевірте, що backend запущений і доступний у мережі.', 0);
  }

  if (!response.ok) {
    let detail = `Помилка ${response.status}`;
    let errorCode: AiErrorCode | undefined;
    try {
      const body = (await response.json()) as { message?: string; error?: AiErrorCode };
      if (body.message) {
        detail = body.message;
      }
      errorCode = body.error;
    } catch {
      // ignore
    }
    throw new AiRequestError(detail, response.status, errorCode);
  }

  return (await response.json()) as RecipesResponse;
}

export function registerPushToken(payload: PushRegistration) {
  return request<{ ok: true }>('/push/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export type ExpiryScanResponse = {
  day: number;
  month: number;
  year: number;
  isoDate: string;
  confidence: number;
  rawText: string | null;
};

export type ProductNameScanResponse = {
  name: string;
  confidence: number;
  rawText: string | null;
};

export async function scanExpiryDateFromImage(payload: {
  imageBase64: string;
  mimeType?: string;
}): Promise<ExpiryScanResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/ai/expiry-from-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new AiRequestError('Не вдалося зʼєднатися з сервером для розпізнавання дати.', 0);
  }

  if (!response.ok) {
    let detail = `Помилка ${response.status}`;
    let errorCode: ExpiryScanErrorCode | undefined;
    try {
      const body = (await response.json()) as { message?: string; error?: ExpiryScanErrorCode };
      if (body.message) {
        detail = body.message;
      }
      errorCode = body.error;
    } catch {
      // ignore
    }
    throw new AiRequestError(detail, response.status, errorCode);
  }

  return (await response.json()) as ExpiryScanResponse;
}

export async function scanProductNameFromImage(payload: {
  imageBase64: string;
  mimeType?: string;
}): Promise<ProductNameScanResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/ai/name-from-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new AiRequestError('Не вдалося зʼєднатися з сервером для розпізнавання назви.', 0);
  }

  if (!response.ok) {
    let detail = `Помилка ${response.status}`;
    let errorCode: ExpiryScanErrorCode | undefined;
    try {
      const body = (await response.json()) as { message?: string; error?: ExpiryScanErrorCode };
      if (body.message) {
        detail = body.message;
      }
      errorCode = body.error;
    } catch {
      // ignore
    }
    throw new AiRequestError(detail, response.status, errorCode);
  }

  return (await response.json()) as ProductNameScanResponse;
}
