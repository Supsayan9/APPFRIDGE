const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
export class AiRequestError extends Error {
    code;
    status;
    constructor(message, status, code) {
        super(message);
        this.name = 'AiRequestError';
        this.status = status;
        this.code = code;
    }
}
async function request(path, init) {
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
        return undefined;
    }
    return (await response.json());
}
export function fetchInventory(owner) {
    return request(`/inventory?owner=${encodeURIComponent(owner)}`);
}
export function addInventoryItem(owner, input) {
    return request('/inventory', {
        method: 'POST',
        body: JSON.stringify({ ...input, owner })
    });
}
export function removeInventoryItem(owner, id) {
    return request(`/inventory/${id}?owner=${encodeURIComponent(owner)}`, { method: 'DELETE' });
}
export function updateInventoryItem(owner, id, patch) {
    return request(`/inventory/${id}?owner=${encodeURIComponent(owner)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
    });
}
export function lookupProduct(barcode) {
    const path = `/products/${encodeURIComponent(barcode)}`;
    return request(path);
}
export function fetchRecipes(owner) {
    return request(`/recipes?owner=${encodeURIComponent(owner)}`);
}
export async function fetchAiRecipes(owner, itemIds) {
    let response;
    try {
        response = await fetch(`${apiUrl}/recipes/ai`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                owner,
                itemIds: Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : undefined
            })
        });
    }
    catch {
        throw new AiRequestError('Не вдалося зʼєднатися з сервером. Перевірте, що backend запущений і доступний у мережі.', 0);
    }
    if (!response.ok) {
        let detail = `Помилка ${response.status}`;
        let errorCode;
        try {
            const body = (await response.json());
            if (body.message) {
                detail = body.message;
            }
            errorCode = body.error;
        }
        catch {
            // ignore
        }
        throw new AiRequestError(detail, response.status, errorCode);
    }
    return (await response.json());
}
export function registerPushToken(payload) {
    return request('/push/register', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
export function unregisterPushToken(token) {
    return request('/push/unregister', {
        method: 'POST',
        body: JSON.stringify({ token })
    });
}
export async function fetchSaladChefOrders(payload) {
    let response;
    try {
        response = await fetch(`${apiUrl}/recipes/salad-chef`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }
    catch {
        throw new AiRequestError('Не вдалося зʼєднатися з сервером для салатів.', 0);
    }
    if (!response.ok) {
        let detail = `Помилка ${response.status}`;
        let errorCode;
        try {
            const body = (await response.json());
            if (body.message) {
                detail = body.message;
            }
            errorCode = body.error;
        }
        catch {
            // ignore
        }
        throw new AiRequestError(detail, response.status, errorCode);
    }
    return (await response.json());
}
export async function scanExpiryDateFromImage(payload) {
    let response;
    try {
        response = await fetch(`${apiUrl}/ai/expiry-from-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }
    catch {
        throw new AiRequestError('Не вдалося зʼєднатися з сервером для розпізнавання дати.', 0);
    }
    if (!response.ok) {
        let detail = `Помилка ${response.status}`;
        let errorCode;
        try {
            const body = (await response.json());
            if (body.message) {
                detail = body.message;
            }
            errorCode = body.error;
        }
        catch {
            // ignore
        }
        throw new AiRequestError(detail, response.status, errorCode);
    }
    return (await response.json());
}
export async function scanProductNameFromImage(payload) {
    let response;
    try {
        response = await fetch(`${apiUrl}/ai/name-from-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }
    catch {
        throw new AiRequestError('Не вдалося зʼєднатися з сервером для розпізнавання назви.', 0);
    }
    if (!response.ok) {
        let detail = `Помилка ${response.status}`;
        let errorCode;
        try {
            const body = (await response.json());
            if (body.message) {
                detail = body.message;
            }
            errorCode = body.error;
        }
        catch {
            // ignore
        }
        throw new AiRequestError(detail, response.status, errorCode);
    }
    return (await response.json());
}
