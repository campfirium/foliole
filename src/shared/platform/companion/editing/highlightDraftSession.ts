import type { CompanionHighlightRead } from '../reading/companionHighlightRead';

// Explicit-save annotations share the app draft owner, without topic autosave semantics.
export class HighlightDraftSession {
  data: CompanionHighlightRead | undefined;
  value = '';
  error = false;
  pending: Promise<void> | null = null;
  private changed = false;
  private listeners = new Set<() => void>();

  constructor(private updateRetention: () => void) {}
  get dirty() { return this.changed; }
  get attached() { return this.listeners.size > 0; }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    this.updateRetention();
    return () => { this.listeners.delete(listener); this.updateRetention(); };
  }
  private publish() { this.listeners.forEach((listener) => listener()); this.updateRetention(); }
  loaded(data: CompanionHighlightRead) {
    if (this.dirty || this.pending) return;
    this.data = data;
    this.value = data.note;
    this.error = false;
    this.publish();
  }
  change(value: string) {
    this.value = value;
    this.changed = value !== (this.data?.note ?? '');
    this.publish();
  }
  write(action: () => Promise<void> | void) {
    if (this.pending) return this.pending;
    this.error = false;
    this.pending = Promise.resolve().then(action).then(() => {
      this.changed = false;
      this.data = undefined;
    }).catch((error) => {
      this.error = true;
      // A failed delete also needs its original read guard on return.
      this.changed = true;
      throw error;
    }).finally(() => {
      this.pending = null;
      this.publish();
    });
    this.publish();
    return this.pending;
  }
}

export class HighlightDraftStore {
  private scopes = new Map<object, Map<string, HighlightDraftSession>>();
  acquire(scope: object, nodeId: string) {
    let entries = this.scopes.get(scope);
    if (!entries) { entries = new Map(); this.scopes.set(scope, entries); }
    const existing = entries.get(nodeId);
    if (existing) return existing;
    const session = new HighlightDraftSession(() => {
      if (session.attached || session.dirty || session.pending) {
        entries!.set(nodeId, session);
        this.scopes.set(scope, entries!);
        return;
      }
      if (entries!.get(nodeId) !== session) return;
      entries!.delete(nodeId);
      if (!entries!.size) this.scopes.delete(scope);
    });
    entries.set(nodeId, session);
    return session;
  }
}
