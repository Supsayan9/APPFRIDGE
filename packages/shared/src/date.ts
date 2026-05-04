import type { InventoryInsight, InventoryItem, InventoryStatus } from './types.js';

const DAY_MS = 1000 * 60 * 60 * 24;

export function parseInventoryDate(dateString: string): Date | null {
  const value = dateString.trim();
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dottedMatch = value.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dottedMatch) {
    const [, day, month, year] = dottedMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function normalizeDateInput(dateString: string): string | null {
  const parsed = parseInventoryDate(dateString);
  if (!parsed) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntil(dateString: string, now = new Date()): number | null {
  const baseline = new Date(now);
  baseline.setHours(0, 0, 0, 0);

  const target = parseInventoryDate(dateString);
  if (!target) {
    return null;
  }

  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - baseline.getTime()) / DAY_MS);
}

export function getInventoryInsight(item: InventoryItem, now = new Date()): InventoryInsight {
  const daysLeft = daysUntil(item.expirationDate, now);

  let status: InventoryStatus = 'fresh';
  if (daysLeft === null) {
    status = 'fresh';
  } else if (daysLeft < 0) {
    status = 'expired';
  } else if (daysLeft <= 3) {
    status = 'expiring';
  }

  return { daysLeft, status };
}

export function formatDaysLabel(daysLeft: number | null): string {
  if (daysLeft === null) {
    return 'Невірний формат дати';
  }
  if (daysLeft < 0) {
    return `Прострочено ${Math.abs(daysLeft)} дн. тому`;
  }
  if (daysLeft === 0) {
    return 'Закінчується сьогодні';
  }
  if (daysLeft === 1) {
    return 'Залишився 1 день';
  }
  return `Залишилось ${daysLeft} дн.`;
}
