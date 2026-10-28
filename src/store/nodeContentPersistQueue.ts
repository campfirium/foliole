interface PersistQueueOptions<T, C> {
  delayMs: number;
  isBlocked: (nodeId: string) => boolean;
  persist: (snapshot: T) => Promise<boolean>;
  readContinuation?: (snapshot: T) => C | undefined;
  continue?: (snapshot: T, continuation: C) => void;
}

type Continuation<C> = { value: C | undefined };
type Entry<T, C> = {
  snapshot: T;
  timer: ReturnType<typeof setTimeout> | null;
  continuation: Continuation<C>;
  predecessor: Continuation<C> | null;
};

function clearTimer<T, C>(entry: Entry<T, C>) {
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
}

/** Owns pending snapshots until the runtime confirms them. */
class NodeContentPersistQueue<T, C> {
  private readonly pending = new Map<string, Entry<T, C>>();
  private readonly running = new Map<string, { entry: Entry<T, C>; promise: Promise<boolean> }>();
  private readonly buffered = new Map<string, Continuation<C> | null>();

  constructor(private readonly options: PersistQueueOptions<T, C>) {}

  private arm(nodeId: string, entry: Entry<T, C>) {
    clearTimer(entry);
    if (this.options.isBlocked(nodeId) || this.buffered.has(nodeId)) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.drain(nodeId, false);
    }, this.options.delayMs);
  }

  drain = async (nodeId: string, explicit = true): Promise<boolean> => {
    const target = this.pending.get(nodeId);
    const active = this.running.get(nodeId);
    if (!target) return active?.promise ?? true;
    clearTimer(target);
    if (active) {
      if (active.entry === target) return active.promise;
      await active.promise;
      if (this.running.has(nodeId)) return this.drain(nodeId, explicit);
    }
    if (this.options.isBlocked(nodeId)) return false;
    if (!explicit && this.buffered.has(nodeId)) return false;
    if (this.pending.get(nodeId) !== target) return this.drain(nodeId, explicit);
    if (target.predecessor?.value !== undefined) this.options.continue?.(target.snapshot, target.predecessor.value);
    target.predecessor = null;
    if (this.buffered.has(nodeId)) this.buffered.set(nodeId, target.continuation);
    const promise = this.options.persist(target.snapshot).catch(() => false).then((accepted) => {
      if (accepted) target.continuation.value = this.options.readContinuation?.(target.snapshot);
      if (accepted && this.pending.get(nodeId) === target) this.pending.delete(nodeId);
      return accepted;
    }).finally(() => {
      if (this.running.get(nodeId)?.entry === target) this.running.delete(nodeId);
    });
    this.running.set(nodeId, { entry: target, promise });
    return promise;
  };

  cancel = (nodeId: string) => {
    this.buffered.delete(nodeId);
    const entry = this.pending.get(nodeId);
    if (entry) clearTimer(entry);
    this.pending.delete(nodeId);
  };

  defer = (nodeId: string) => {
    if (!this.buffered.has(nodeId)) {
      this.buffered.set(nodeId, this.running.get(nodeId)?.entry.continuation ?? this.pending.get(nodeId)?.predecessor ?? null);
    }
    const entry = this.pending.get(nodeId);
    if (entry) clearTimer(entry);
  };

  resume = (nodeId: string) => {
    this.buffered.delete(nodeId);
    const entry = this.pending.get(nodeId);
    if (entry && this.running.get(nodeId)?.entry !== entry) this.arm(nodeId, entry);
  };

  nodeIds = () => [...new Set([...this.pending.keys(), ...this.running.keys()])];

  reset = () => {
    this.pending.forEach(clearTimer);
    this.pending.clear();
    this.running.clear();
    this.buffered.clear();
  };

  updatePending(nodeId: string, update: (snapshot: T) => void) {
    const entry = this.pending.get(nodeId);
    if (entry) update(entry.snapshot);
  }

  schedule(nodeId: string, snapshot: T) {
    const previous = this.pending.get(nodeId);
    const predecessor = this.buffered.get(nodeId) ?? this.running.get(nodeId)?.entry.continuation ?? previous?.predecessor ?? null;
    this.buffered.delete(nodeId);
    if (previous) clearTimer(previous);
    const entry: Entry<T, C> = { snapshot, timer: null, predecessor, continuation: { value: undefined } };
    this.pending.set(nodeId, entry);
    this.arm(nodeId, entry);
  }
}

export function createNodeContentPersistQueue<T, C = never>(options: PersistQueueOptions<T, C>) {
  return new NodeContentPersistQueue(options);
}
