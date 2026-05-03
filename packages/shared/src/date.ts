import type { InventoryInsight, InventoryItem, InventoryStatus } from './types';

const DAY_MS = 1000 * 60 * 60 * 24;

export function daysUntil(dateString: string, now = new Date()): number {
  const baseline = new Date(now);
  baseline.setHours(0, 0, 0, 0);

  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - baseline.getTime()) / DAY_MS);
}

export function getInventoryInsight(item: InventoryItem, now = new Date()): InventoryInsight {
  const daysLeft = daysUntil(item.expirationDate, now);

  let status: InventoryStatus = 'fresh';
  if (daysLeft < 0) {
    status = 'expired';
  } else if (daysLeft <= 3) {
    status = 'expiring';
  }

  return { daysLeft, status };
}

export function formatDaysLabel(daysLeft: number): string {
  if (daysLeft < 0) {
    return `Expired ${Math.abs(daysLeft)} day(s) ago`;
  }
  if (daysLeft === 0) {
    return 'Expires today';
  }
  if (daysLeft === 1) {
    return '1 day left';
  }
  return `${daysLeft} days left`;
}
