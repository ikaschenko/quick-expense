export function readJsonStorage<T>(storage: Storage, key: string): T | null {
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeJsonStorage<T>(storage: Storage, key: string, value: T): void {
  storage.setItem(key, JSON.stringify(value));
}
