export type WorkspaceRefreshScope =
  | { kind: 'full' }
  | { kind: 'nodes'; nodeIds: readonly string[] };

interface PendingRefresh {
  revision: number;
  scope: WorkspaceRefreshScope;
}

export interface WorkspaceSnapshotReader<T> {
  (input: { current: T; scope: WorkspaceRefreshScope }): Promise<T>;
}

function combineScopes(entries: readonly PendingRefresh[]): WorkspaceRefreshScope {
  if (entries.some(entry => entry.scope.kind === 'full')) return { kind: 'full' };
  return { kind: 'nodes', nodeIds: [...new Set(entries.flatMap(entry =>
    entry.scope.kind === 'nodes' ? entry.scope.nodeIds : []))] };
}

/** Owns published snapshots, not database writes or uncommitted editor drafts. */
export class WorkspaceSnapshotRefresh<T> {
  private session = 0;
  private revision = 0;
  private pending: PendingRefresh[] = [];
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(private snapshot: T, private readonly read?: WorkspaceSnapshotReader<T>) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Call only for committed changes, or an explicit request to reread current state. */
  register(scope: WorkspaceRefreshScope) {
    this.pending.push({ revision: ++this.revision, scope: scope.kind === 'full'
      ? scope : { kind: 'nodes', nodeIds: [...scope.nodeIds] } });
  }

  reset(snapshot: T) {
    this.session += 1;
    this.pending = [];
    this.snapshot = snapshot;
    this.notify();
  }

  async updateDerived(baseline: T, update: (current: T) => T) {
    if (this.running) await this.running;
    if (baseline !== this.snapshot) return false;
    this.snapshot = update(this.snapshot);
    this.notify();
    return true;
  }

  refresh(read: WorkspaceSnapshotReader<T> | undefined = this.read): Promise<void> {
    if (this.running) return this.running;
    if (!read) return Promise.reject(new Error('workspace_snapshot_reader_missing'));
    const running: Promise<void> = this.drain(read).then(() => {
      if (this.running === running) this.running = null;
      if (this.pending.length) return this.refresh(read);
    }, error => {
      if (this.running === running) this.running = null;
      throw error;
    });
    this.running = running;
    return running;
  }

  private async drain(read: WorkspaceSnapshotReader<T>) {
    while (this.pending.length) {
      const session = this.session;
      const revision = this.revision;
      const scope = combineScopes(this.pending);
      let next: T;
      try {
        next = await read({ current: this.snapshot, scope });
      } catch (error) {
        if (session !== this.session) continue;
        throw error;
      }
      if (session !== this.session) continue;
      this.snapshot = next;
      this.pending = this.pending.filter(entry => entry.revision > revision);
      this.notify();
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try { listener(); }
      catch { /* An observer cannot undo publication or consume a later refresh. */ }
    }
  }
}
