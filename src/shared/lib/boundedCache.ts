export class BoundedCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('BoundedCache limit must be a positive integer');
    }
  }

  get size() {
    return this.entries.size;
  }

  get(key: K) {
    if (!this.entries.has(key)) {
      return undefined;
    }
    const value = this.entries.get(key)!;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.trimToLimit();
  }

  delete(key: K) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  private trimToLimit() {
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

export function createBoundedCache<K, V>(limit: number) {
  return new BoundedCache<K, V>(limit);
}
