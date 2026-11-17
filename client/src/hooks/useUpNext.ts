import { useSyncExternalStore } from 'react';
import storage from '../utils/storage';

/**
 * Up next: the ordered list of starred books, by route id (as in /player/:id),
 * stored in electron-store under `upNext` as a JSON array. Starring appends,
 * unstarring removes; the Edit sheet reorders. Shared by every component that
 * shows a star, so they all update together.
 */
const UP_NEXT_KEY = 'upNext';

let ids: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const save = (next: string[]) => {
  ids = next;
  emit();
  storage.set(UP_NEXT_KEY, JSON.stringify(next)).catch(() => undefined);
};

storage.get(UP_NEXT_KEY)
  .then((raw: unknown) => {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      ids = parsed.map(String);
      emit();
    }
  })
  .catch(() => undefined);

export const upNext = {
  toggle: (id: string) => save(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
  remove: (id: string) => save(ids.filter((x) => x !== id)),
  reorder: (next: string[]) => save(next),
};

export function useUpNext(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ids,
  );
}
