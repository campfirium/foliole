// Demand reads start immediately; speculative reads yield between documents.
export class DocumentLoadRequests<T> {
  private readonly pending = new Map<string, Promise<T | null>>();

  has(key: string) { return this.pending.has(key); }
  clear() { this.pending.clear(); }

  async load(key: string, read: () => Promise<T | null>) {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = read();
    this.pending.set(key, promise);
    try { return await promise; }
    finally { if (this.pending.get(key) === promise) this.pending.delete(key); }
  }
}

export class DocumentPreparationQueue {
  private queued: string[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly skip: (key: string) => boolean,
    private readonly load: (key: string) => Promise<unknown>, private readonly limit = 2) {}

  request(keys: readonly string[]) {
    for (const key of new Set(keys.filter(Boolean))) {
      if (!this.queued.includes(key) && !this.skip(key)) this.queued.push(key);
    }
    this.queued = this.queued.slice(-this.limit);
    this.schedule();
  }

  clear() {
    this.queued = [];
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.running || this.timer !== null || !this.queued.length) return;
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, 16);
  }

  private async run() {
    this.running = true;
    try {
      while (this.queued.length) {
        const key = this.queued.shift()!;
        if (this.skip(key)) continue;
        await this.load(key).catch(() => null);
        break;
      }
    } finally { this.running = false; this.schedule(); }
  }
}

export function resolveNextDocumentId(currentId: string | null, ids: readonly string[]) {
  if (!currentId) return null;
  const index = ids.indexOf(currentId);
  return index >= 0 ? ids[index + 1] ?? null : ids.find(id => id !== currentId) ?? null;
}
