/**
 * `nodeIds` are content projections. The local-state lists name committed
 * reading, review, open-record or active-node writes that can be read narrowly.
 */
export type WorkspaceRefreshScope =
  | { kind: 'full' }
  | {
    kind: 'nodes';
    nodeIds: readonly string[];
    reviewNodeIds?: readonly string[];
    readingNodeIds?: readonly string[];
    openStateNodeIds?: readonly string[];
    activeNode?: boolean;
    structure?: boolean;
  };

interface PendingRefresh {
  revision: number;
  scope: WorkspaceRefreshScope;
}

export interface WorkspaceSnapshotReader<T> {
  (input: { current: T; scope: WorkspaceRefreshScope }): Promise<T>;
}

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

function unionIds(scopes: readonly NodeScope[], pick: (scope: NodeScope) => readonly string[] | undefined) {
  return [...new Set(scopes.flatMap(scope => pick(scope) ?? []))];
}

function copyNodeScope(scopes: readonly NodeScope[]): NodeScope {
  const scope: NodeScope = { kind: 'nodes', nodeIds: unionIds(scopes, item => item.nodeIds) };
  const reviewNodeIds = unionIds(scopes, item => item.reviewNodeIds);
  const readingNodeIds = unionIds(scopes, item => item.readingNodeIds);
  const openStateNodeIds = unionIds(scopes, item => item.openStateNodeIds);
  if (reviewNodeIds.length) scope.reviewNodeIds = reviewNodeIds;
  if (readingNodeIds.length) scope.readingNodeIds = readingNodeIds;
  if (openStateNodeIds.length) scope.openStateNodeIds = openStateNodeIds;
  if (scopes.some(item => item.activeNode)) scope.activeNode = true;
  if (scopes.some(item => item.structure)) scope.structure = true;
  return scope;
}

function combineScopes(entries: readonly PendingRefresh[]): WorkspaceRefreshScope {
  if (entries.some(entry => entry.scope.kind === 'full')) return { kind: 'full' };
  return copyNodeScope(entries.map(entry => entry.scope as NodeScope));
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
      ? scope : copyNodeScope([scope]) });
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
    const next = update(this.snapshot);
    if (!Object.is(next, this.snapshot)) {
      this.snapshot = next;
      this.notify();
    }
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
      const changed = !Object.is(this.snapshot, next);
      this.snapshot = next;
      this.pending = this.pending.filter(entry => entry.revision > revision);
      if (changed) this.notify();
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try { listener(); }
      catch { /* An observer cannot undo publication or consume a later refresh. */ }
    }
  }
}
