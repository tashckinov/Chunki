import { postJson } from './collections';

type EventName = 'app_opened' | 'placement_started' | 'placement_result_viewed' | 'program_opened'
  | 'topic_opened' | 'topic_study_started' | 'collection_opened' | 'deck_started' | 'card_viewed' | 'deck_completed'
  | 'comic_opened' | 'comic_completed' | 'notification_permission_granted' | 'notification_permission_denied';
type Event = { id: string; name: EventName; at: string; contentId?: string; journeyId?: string; context?: string };

let sending = false;
const fallback = new Map<string, Event>();
const prefix = (user: string) => `chunki-product-event:${user}:`;

function pending(user: string): Event[] {
  const start = prefix(user);
  const events = new Map<string, Event>();
  for (const [key, event] of fallback) if (key.startsWith(start)) events.set(event.id, event);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(start)) continue;
      const raw = localStorage.getItem(key);
      if (raw) {
        const event: Event = JSON.parse(raw);
        events.set(event.id, event);
      }
    }
  } catch {
    // Browser storage can be unavailable in some modes.
  }
  return [...events.values()].sort((left, right) => left.at.localeCompare(right.at));
}

function discard(user: string, id: string) {
  const key = prefix(user) + id;
  fallback.delete(key);
  try { localStorage.removeItem(key); } catch { /* Memory-only queue. */ }
}

export function track(user: string | undefined, name: EventName, details: Omit<Event, 'id' | 'name' | 'at'> = {},
  id: string | undefined = globalThis.crypto?.randomUUID?.()) {
  if (!user || !id) return;
  const key = prefix(user) + id;
  const event = { id, name, at: new Date().toISOString(), ...details };
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(event));
  } catch {
    fallback.set(key, event);
  }
}

export async function flushEvents(user: string, isCurrent: () => boolean) {
  if (sending) return;
  sending = true;
  try {
    const now = Date.now();
    for (const event of pending(user).slice(0, -300)) discard(user, event.id);
    while (isCurrent()) {
      const events = pending(user).slice(0, 25);
      if (!events.length) break;
      const current = events.filter(({ at }) => Date.parse(at) >= now - 30 * 86400000);
      if (current.length) await postJson('/api/analytics/events', current);
      for (const { id } of events) discard(user, id);
    }
  } catch {
    // Keep original event IDs and timestamps for the next retry.
  } finally {
    sending = false;
  }
}

export async function reportNotificationClick(id: string) {
  await postJson('/api/analytics/notification-click', { id });
}
