/**
 * `nodeIds` are content projections. The local-state lists name committed
 * reading, review, view-state, open-record or active-node writes that can be read narrowly.
 */
export type WorkspaceRefreshScope =
  | { kind: 'full' }
  | {
    kind: 'nodes';
    nodeIds: readonly string[];
    reviewNodeIds?: readonly string[];
    readingNodeIds?: readonly string[];
    viewStateNodeIds?: readonly string[];
    openStateNodeIds?: readonly string[];
    activeNode?: boolean;
    structure?: boolean;
    /** Every structural change in this scope moved `nodeIds` into Trash, so a scoped merge may prove it. */
    trash?: boolean;
    /**
     * Every change in this scope is a metadata write confined to `nodeIds` and their children,
     * so a scoped merge may prove it and order again only the parents it touches.
     */
    metadata?: boolean;
  };

export interface WorkspaceSnapshotReader<T> {
  (input: { current: T; scope: WorkspaceRefreshScope }): Promise<T>;
}

const nodeIdFields = ['nodeIds', 'reviewNodeIds', 'readingNodeIds', 'viewStateNodeIds', 'openStateNodeIds'] as const;
type NodeIdField = typeof nodeIdFields[number];

class WorkspaceRefreshScopes {
  private ids = new Map<NodeIdField, Set<string>>();
  private full = false;
  private activeNode = false;
  private structure = false;
  private sawTrash = false;
  private sawMetadata = false;
  private sawOtherThanTrash = false;
  private sawOtherThanTrashOrMetadata = false;

  add(scope: WorkspaceRefreshScope) {
    if (this.full) return;
    if (scope.kind === 'full') {
      this.full = true;
      this.ids.clear();
      return;
    }
    for (const field of nodeIdFields) {
      const values = scope[field];
      if (!values?.length) continue;
      const ids = this.ids.get(field) ?? new Set<string>();
      for (const id of values) ids.add(id);
      this.ids.set(field, ids);
    }
    this.activeNode ||= Boolean(scope.activeNode);
    this.structure ||= Boolean(scope.structure);
    this.sawTrash ||= Boolean(scope.trash);
    this.sawMetadata ||= Boolean(scope.metadata);
    this.sawOtherThanTrash ||= Boolean(scope.structure && !scope.trash);
    this.sawOtherThanTrashOrMetadata ||= Boolean(scope.structure && !scope.trash && !scope.metadata);
  }

  toScope(): WorkspaceRefreshScope {
    if (this.full) return { kind: 'full' };
    const scope: Extract<WorkspaceRefreshScope, { kind: 'nodes' }> = { kind: 'nodes', nodeIds: [] };
    for (const [field, ids] of this.ids) scope[field] = [...ids];
    if (this.activeNode) scope.activeNode = true;
    if (this.structure) scope.structure = true;
    if (this.sawTrash && !this.sawOtherThanTrash) scope.trash = true;
    if (this.sawMetadata && !this.sawOtherThanTrashOrMetadata) scope.metadata = true;
    return scope;
  }
}

export function mergeWorkspaceRefreshScopes(scopes: readonly WorkspaceRefreshScope[]): WorkspaceRefreshScope {
  const pending = new WorkspaceRefreshScopes();
  for (const scope of scopes) pending.add(scope);
  return pending.toScope();
}

export function workspaceRefreshScopeHasChanges(scope: WorkspaceRefreshScope) {
  return scope.kind === 'full' || Boolean(scope.nodeIds.length || scope.reviewNodeIds?.length
    || scope.readingNodeIds?.length || scope.viewStateNodeIds?.length || scope.openStateNodeIds?.length
    || scope.structure || scope.activeNode);
}

/** Owns published snapshots, not database writes or uncommitted editor drafts. */
export class WorkspaceSnapshotRefresh<T> {
  private session = 0;
  private pending: WorkspaceRefreshScopes | null = null;
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(private snapshot: T, private readonly read?: WorkspaceSnapshotReader<T>) {}

  getSnapshot = () => this.snapshot;

  /** True while a refresh is reading; a caller that refreshes now waits for it and for every scope registered meanwhile. */
  get refreshing() { return this.running !== null; }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Call only for committed changes, or an explicit request to reread current state. */
  register(scope: WorkspaceRefreshScope) {
    this.pending ??= new WorkspaceRefreshScopes();
    this.pending.add(scope);
  }

  reset(snapshot: T) {
    this.session += 1;
    this.pending = null;
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
      if (this.pending) return this.refresh(read);
    }, error => {
      if (this.running === running) this.running = null;
      throw error;
    });
    this.running = running;
    return running;
  }

  private async drain(read: WorkspaceSnapshotReader<T>) {
    while (this.pending) {
      const session = this.session;
      const batch = this.pending;
      const scope = batch.toScope();
      this.pending = null;
      let next: T;
      try {
        next = await read({ current: this.snapshot, scope });
      } catch (error) {
        if (session !== this.session) continue;
        this.retainFailedBatch(batch);
        throw error;
      }
      if (session !== this.session) continue;
      const changed = !Object.is(this.snapshot, next);
      this.snapshot = next;
      if (changed) this.notify();
    }
  }

  private retainFailedBatch(batch: WorkspaceRefreshScopes) {
    if (this.pending) batch.add(this.pending.toScope());
    this.pending = batch;
  }

  private notify() {
    for (const listener of this.listeners) {
      try { listener(); }
      catch { /* An observer cannot undo publication or consume a later refresh. */ }
    }
  }
}
