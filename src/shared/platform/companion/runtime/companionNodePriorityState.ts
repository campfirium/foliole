import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { WorkspaceNodePriorityState, type PriorityIndexNode } from '../../../../../lib/core/nodes/workspaceNodePriorityState';
import type { RegularPushQueuePriority } from '../../../../../lib/core/review/unifiedPushQueueRules';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

interface PriorityRow extends DbRow {
  id: string; parent_id: string | null; priority: number | null; created_at: string; deleted_at: string | null;
}

export class CompanionNodePriorityState {
  private nodeOrder: readonly string[] | null = null;
  private state: WorkspaceNodePriorityState | null = null;
  private failure: unknown = null;
  revision = 0;
  private readonly pending = new Set<string>();
  private fullRefresh = false;

  async read(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    return (await this.readIndex(db, defaultPriority, initial)).priorities;
  }

  async readIndex(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    if (this.failure) throw this.failure;
    if (!this.state) this.state = new WorkspaceNodePriorityState(initial ?? await readNodes(db), defaultPriority);
    this.state.setDefaultPriority(defaultPriority);
    return { priorities: this.state.priorities, paths: this.state.paths };
  }

  readMetadata() {
    if (this.failure) throw this.failure;
    return this.state?.metadata ?? null;
  }

  async readOrder(db: DbPort, initial?: readonly string[]): Promise<readonly string[]> {
    if (this.failure) throw this.failure;
    if (initial) this.nodeOrder = [...initial];
    if (!this.nodeOrder) {
      const rows = await db.query<{ id: string }>(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceOrderedNodeIds.sql);
      this.nodeOrder = rows.map(row => row.id);
    }
    return this.nodeOrder;
  }

  async refresh(db: DbPort, scope: WorkspaceRefreshScope) {
    const structure = scope.kind === 'full' || scope.structure;
    if (structure || (!this.state && scope.kind === 'nodes' && scope.nodeIds.length)) this.nodeOrder = null;
    if (scope.kind === 'full') this.fullRefresh = true;
    else for (const id of scope.nodeIds) this.pending.add(id);
    if (!this.fullRefresh && !this.pending.size && !structure) return;
    this.revision += 1;
    try {
      if (this.state && (this.fullRefresh || this.pending.size)) {
        const ids = this.fullRefresh ? undefined : [...this.pending];
        const rows = await readNodes(db, ids);
        const existing = new Set(rows.map(node => node.id));
        const changed = this.state.update(rows, (ids ?? [...this.state.priorities.keys()]).filter(id => !existing.has(id)));
        if (changed) this.nodeOrder = null;
      }
      this.pending.clear();
      this.fullRefresh = false;
      this.failure = null;
    } catch (error) {
      this.failure = error;
      throw error;
    }
  }

  clear() {
    this.nodeOrder = null;
    this.state = null;
    this.failure = null;
    this.revision += 1;
    this.pending.clear();
    this.fullRefresh = false;
  }
}

async function readNodes(db: DbPort, ids?: readonly string[]) {
  const rows = await db.query<PriorityRow>(`SELECT id, parent_id, priority, created_at, deleted_at FROM nodes${ids
    ? ' WHERE id IN (SELECT value FROM json_each(?))' : ''}`, ids ? [JSON.stringify(ids)] : []);
  return rows.map(row => ({ id: row.id, parentNodeId: row.parent_id, priority: row.priority,
    createdAt: row.created_at, deletedAt: row.deleted_at }));
}
