import { describe, expect, it } from 'vitest';
import { daysUntil, getInventoryInsight } from './date';
import type { InventoryItem } from './types';

const item: InventoryItem = {
  id: '1',
  barcode: '123',
  name: 'Milk',
  expirationDate: '2025-01-12',
  quantity: 1,
  location: 'fridge',
  createdAt: '2025-01-01T00:00:00.000Z'
};

describe('date helpers', () => {
  it('calculates days left', () => {
    expect(daysUntil('2025-01-12', new Date('2025-01-10T10:00:00.000Z'))).toBe(2);
  });

  it('returns expiring status for items within three days', () => {
    expect(getInventoryInsight(item, new Date('2025-01-10T10:00:00.000Z')).status).toBe('expiring');
  });

  it('returns expired status for overdue items', () => {
    expect(getInventoryInsight(item, new Date('2025-01-13T10:00:00.000Z')).status).toBe('expired');
  });
});
