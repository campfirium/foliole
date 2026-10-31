interface PersistQueueOptions<T, C> {
  delayMs: number;
  isBlocked: (nodeId: string) => boolean;
  persist: (snapshot: T) => Promise<boolean>;
  readContinuation?: (snapshot: T) => C | undefined;
  continue?: (snapshot: T, continuation: C) => void;
  scope?: (snapshot: T) => unknown;
}

export interface NodeContentCommit {
  run: () => Promise<boolean>;
}

type Continuation<C> = { value: C | undefined };
type Entry<T, C> = {
  snapshot: T;
  fixed: boolean;
  failed: boolean;
  saved: boolean;
  discarded: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  continuation: Continuation<C>;
  predecessor: Continuation<C> | null;
};

function clearTimer<T, C>(entry: Entry<T, C>) {
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
}

/** Coalesce ordinary drafts while retaining explicit replay commits in their input order. */
class NodeContentPersistQueue<T, C> {
  private readonly pending = new Map<string, Entry<T, C>[]>();
  private readonly running = new Map<string, { entry: Entry<T, C>; promise: Promise<boolean> }>();
  private readonly buffered = new Map<string, Continuation<C> | null>();

  constructor(private readonly options: PersistQueueOptions<T, C>) {}

  private arm(nodeId: string, entry: Entry<T, C>) {
    clearTimer(entry);
    const first = this.pending.get(nodeId)?.[0];
    if (this.options.isBlocked(nodeId) || first?.failed || (this.buffered.has(nodeId) && !first?.fixed)) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.drainTo(nodeId, entry, false);
    }, this.options.delayMs);
  }

  private async save(nodeId: string, entry: Entry<T, C>): Promise<boolean> {
    if (entry.predecessor?.value !== undefined) this.options.continue?.(entry.snapshot, entry.predecessor.value);
    entry.predecessor = null;
    if (this.buffered.has(nodeId)) this.buffered.set(nodeId, entry.continuation);
    const promise = this.options.persist(entry.snapshot).catch(() => false).then(accepted => {
      entry.failed = !accepted;
      entry.saved = accepted;
      if (accepted) {
        entry.continuation.value = this.options.readContinuation?.(entry.snapshot);
        const entries = this.pending.get(nodeId);
        if (entries?.[0] === entry) {
          entries.shift();
          if (!entries.length) this.pending.delete(nodeId);
        }
      }
      return accepted;
    }).finally(() => {
      if (this.running.get(nodeId)?.entry === entry) this.running.delete(nodeId);
      const last = this.pending.get(nodeId)?.at(-1);
      if (entry.saved && last) this.arm(nodeId, last);
    });
    this.running.set(nodeId, { entry, promise });
    return promise;
  }

  private async drainTo(nodeId: string, target: Entry<T, C>, explicit: boolean): Promise<boolean> {
    clearTimer(target);
    while (!target.saved && !target.discarded) {
      const active = this.running.get(nodeId);
      if (active) {
        if (!await active.promise) return false;
        continue;
      }
      const first = this.pending.get(nodeId)?.[0];
      if (!first || this.options.isBlocked(nodeId)) return false;
      if (!explicit && (first.failed || (this.buffered.has(nodeId) && !first.fixed))) return false;
      clearTimer(first);
      if (!await this.save(nodeId, first)) return false;
    }
    return target.saved;
  }

  drain = async (nodeId: string, explicit = true): Promise<boolean> => {
    const target = this.pending.get(nodeId)?.at(-1);
    if (!target) return this.running.get(nodeId)?.promise ?? true;
    const saved = await this.drainTo(nodeId, target, explicit);
    return !saved && target.discarded ? this.drain(nodeId, explicit) : saved;
  };

  cancel = (nodeId: string) => {
    this.buffered.delete(nodeId);
    for (const entry of this.pending.get(nodeId) ?? []) {
      clearTimer(entry);
      if (this.running.get(nodeId)?.entry !== entry) entry.discarded = true;
    }
    this.pending.delete(nodeId);
    this.running.delete(nodeId);
  };

  defer = (nodeId: string) => {
    if (!this.buffered.has(nodeId)) {
      this.buffered.set(nodeId, this.running.get(nodeId)?.entry.continuation ?? this.pending.get(nodeId)?.at(-1)?.predecessor ?? null);
    }
    for (const entry of this.pending.get(nodeId) ?? []) if (!entry.fixed) clearTimer(entry);
  };

  resume = (nodeId: string) => {
    this.buffered.delete(nodeId);
    const entry = this.pending.get(nodeId)?.at(-1);
    if (entry && this.running.get(nodeId)?.entry !== entry) this.arm(nodeId, entry);
  };

  nodeIds = () => [...new Set([...this.pending.keys(), ...this.running.keys()])];

  reset = () => {
    for (const nodeId of this.pending.keys()) this.cancel(nodeId);
    this.running.clear();
    this.buffered.clear();
  };

  updatePending(nodeId: string, update: (snapshot: T) => void) {
    for (const entry of this.pending.get(nodeId) ?? []) {
      if (entry !== this.running.get(nodeId)?.entry) update(entry.snapshot);
    }
  }

  schedule(nodeId: string, snapshot: T, options: { fixed?: boolean } = {}): NodeContentCommit {
    const previousScope = this.pending.get(nodeId)?.[0] ?? this.running.get(nodeId)?.entry;
    if (previousScope && this.options.scope && this.options.scope(previousScope.snapshot) !== this.options.scope(snapshot)) this.cancel(nodeId);
    const entries = this.pending.get(nodeId) ?? [];
    const previous = entries.at(-1);
    const replacing = previous && !previous.fixed && !options.fixed && previous !== this.running.get(nodeId)?.entry;
    const predecessor = this.buffered.get(nodeId) ?? (replacing ? previous.predecessor : previous?.continuation)
      ?? this.running.get(nodeId)?.entry.continuation ?? null;
    this.buffered.delete(nodeId);
    if (replacing) {
      clearTimer(previous);
      previous.discarded = true;
      entries.pop();
    }
    const entry: Entry<T, C> = { snapshot, fixed: options.fixed === true, failed: false, saved: false, discarded: false,
      timer: null, predecessor, continuation: { value: undefined } };
    entries.push(entry);
    this.pending.set(nodeId, entries);
    this.arm(nodeId, entry);
    return { run: () => this.drainTo(nodeId, entry, true) };
  }
}

export function createNodeContentPersistQueue<T, C = never>(options: PersistQueueOptions<T, C>) {
  return new NodeContentPersistQueue(options);
}
