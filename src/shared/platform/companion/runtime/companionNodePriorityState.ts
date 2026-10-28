import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { WorkspaceNodePriorityState, type PriorityIndexNode } from '../../../../../lib/core/nodes/workspaceNodePriorityState';
import type { RegularPushQueuePriority } from '../../../../../lib/core/review/unifiedPushQueueRules';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

interface PriorityRow extends DbRow { id: string; parent_id: string | null; priority: number | null }

export class CompanionNodePriorityState {
  private state: WorkspaceNodePriorityState | null = null;
  private failure: unknown = null;
  revision = 0;
  private readonly pending = new Set<string>();
  private fullRefresh = false;

  async read(db: DbPort, defaultPriority: RegularPushQueuePriority, initial?: Iterable<PriorityIndexNode>) {
    if (this.failure) throw this.failure;
    if (!this.state) this.state = new WorkspaceNodePriorityState(initial ?? await readNodes(db), defaultPriority);
    this.state.setDefaultPriority(defaultPriority);
    return this.state.priorities;
  }

  async refresh(db: DbPort, scope: WorkspaceRefreshScope) {
    if (scope.kind === 'full') this.fullRefresh = true;
    else for (const id of scope.nodeIds) this.pending.add(id);
    if (!this.fullRefresh && !this.pending.size) return;
    this.revision += 1;
    try {
      if (this.state) {
        const ids = this.fullRefresh ? undefined : [...this.pending];
        const rows = await readNodes(db, ids);
        const existing = new Set(rows.map(node => node.id));
        this.state.update(rows, (ids ?? [...this.state.priorities.keys()]).filter(id => !existing.has(id)));
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
    this.state = null;
    this.failure = null;
    this.revision += 1;
    this.pending.clear();
    this.fullRefresh = false;
  }
}

async function readNodes(db: DbPort, ids?: readonly string[]) {
  const rows = await db.query<PriorityRow>(`SELECT id, parent_id, priority FROM nodes${ids
    ? ' WHERE id IN (SELECT value FROM json_each(?))' : ''}`, ids ? [JSON.stringify(ids)] : []);
  return rows.map(row => ({ id: row.id, parentNodeId: row.parent_id, priority: row.priority }));
}
