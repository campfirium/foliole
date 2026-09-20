interface PersistQueueOptions<T> {
  delayMs: number;
  isBlocked: (nodeId: string) => boolean;
  persist: (snapshot: T) => Promise<boolean>;
}

type Entry<T> = { snapshot: T; timer: ReturnType<typeof setTimeout> | null };

function clearTimer<T>(entry: Entry<T>) {
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
}

/** Owns pending snapshots until the runtime confirms them. */
class NodeContentPersistQueue<T> {
  private readonly pending = new Map<string, Entry<T>>();
  private readonly running = new Map<string, { entry: Entry<T>; promise: Promise<boolean> }>();

  constructor(private readonly options: PersistQueueOptions<T>) {}

  private arm(nodeId: string, entry: Entry<T>) {
    clearTimer(entry);
    if (this.options.isBlocked(nodeId)) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.drain(nodeId);
    }, this.options.delayMs);
  }

  drain = async (nodeId: string): Promise<boolean> => {
    const target = this.pending.get(nodeId);
    const active = this.running.get(nodeId);
    if (!target) return active?.promise ?? true;
    clearTimer(target);
    if (active) {
      if (active.entry === target) return active.promise;
      await active.promise;
      if (this.running.has(nodeId)) return this.drain(nodeId);
    }
    if (this.options.isBlocked(nodeId)) return false;
    if (this.pending.get(nodeId) !== target) return this.drain(nodeId);
    const promise = this.options.persist(target.snapshot).catch(() => false).then((accepted) => {
      if (accepted && this.pending.get(nodeId) === target) this.pending.delete(nodeId);
      return accepted;
    }).finally(() => {
      if (this.running.get(nodeId)?.entry === target) this.running.delete(nodeId);
    });
    this.running.set(nodeId, { entry: target, promise });
    return promise;
  };

  cancel = (nodeId: string) => {
    const entry = this.pending.get(nodeId);
    if (entry) clearTimer(entry);
    this.pending.delete(nodeId);
  };

  defer = (nodeId: string) => {
    const entry = this.pending.get(nodeId);
    if (entry && this.running.get(nodeId)?.entry !== entry) this.arm(nodeId, entry);
  };

  nodeIds = () => [...new Set([...this.pending.keys(), ...this.running.keys()])];

  reset = () => {
    this.pending.forEach(clearTimer);
    this.pending.clear();
    this.running.clear();
  };

  schedule(nodeId: string, snapshot: T) {
    const previous = this.pending.get(nodeId);
    if (previous) clearTimer(previous);
    const entry: Entry<T> = { snapshot, timer: null };
    this.pending.set(nodeId, entry);
    this.arm(nodeId, entry);
  }
}

export function createNodeContentPersistQueue<T>(options: PersistQueueOptions<T>) {
  return new NodeContentPersistQueue(options);
}
