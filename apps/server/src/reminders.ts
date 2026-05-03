import type { InventoryItem } from '@appfridge/shared';
import { getInventoryInsight } from '@appfridge/shared';
import { listInventory, listPushTokens } from './db.js';

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, string>;
}

function buildReminderMessage(item: InventoryItem): string {
  const insight = getInventoryInsight(item);
  if (insight.daysLeft < 0) {
    return `${item.name} is already expired. Remove it or use it if still safe.`;
  }
  if (insight.daysLeft === 0) {
    return `${item.name} expires today. Use it now.`;
  }
  return `${item.name} expires in ${insight.daysLeft} day(s).`;
}

export function getUrgentInventory(now = new Date()): InventoryItem[] {
  return listInventory().filter((item) => getInventoryInsight(item, now).status !== 'fresh');
}

export async function sendReminderPushes() {
  const tokens = listPushTokens();
  const urgentItems = getUrgentInventory();

  if (tokens.length === 0 || urgentItems.length === 0) {
    return { sent: 0, urgentCount: urgentItems.length };
  }

  const messages: ExpoPushMessage[] = tokens.flatMap((token) =>
    urgentItems.slice(0, 3).map((item) => ({
      to: token,
      sound: 'default',
      title: 'AppFridge reminder',
      body: buildReminderMessage(item),
      data: { itemId: item.id }
    }))
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages)
  });

  return { sent: messages.length, urgentCount: urgentItems.length };
}
