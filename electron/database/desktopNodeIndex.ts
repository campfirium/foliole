import type { Database } from 'better-sqlite3';

import { projectParentChildOrder, readParentChildOrders } from '../../lib/core/database/parentChildOrder.js';
import { WorkspaceNodePriorityState, type PriorityIndexNode } from '../../lib/core/nodes/workspaceNodePriorityState.js';
import type { RegularPushQueuePriority } from '../../lib/core/review/unifiedPushQueueRules.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { clearDesktopNodeIndexChanges, desktopNodeIndexHasChanges,
  installDesktopNodeIndexChanges, readDesktopIndexNodes } from './desktopNodeIndexChanges.js';

const owners = new WeakMap<Database, DesktopNodeIndex>();
export type DesktopNodeIndexView = ReturnType<DesktopNodeIndex['view']>;
type InitialNodes = { nodes: Iterable<PriorityIndexNode>; order: readonly string[]; version: number };

class DesktopNodeIndex {
  private state: WorkspaceNodePriorityState | null = null;
  private order: readonly string[] | null = null;
  private version = 0;

  constructor(private readonly sqlite: Database) { installDesktopNodeIndexChanges(sqlite); }

  prepare(defaultPriority: RegularPushQueuePriority, initial?: InitialNodes) {
    if (this.sqlite.inTransaction) throw new Error('desktop_node_index_prepare_requires_committed_connection');
    if (this.available()) { this.state!.setDefaultPriority(defaultPriority); return this.view(); }
    try { return this.refresh(defaultPriority, initial); }
    catch (error) { this.state = null; this.order = null; throw error; }
  }

  private refresh(defaultPriority: RegularPushQueuePriority, initial?: InitialNodes) {
    // Acquire the write reservation before comparing versions or consuming pending changes.
    return this.sqlite.transaction(() => {
      const version = this.dataVersion();
      if (initial?.version !== version) initial = undefined;
      if (this.state && version !== this.version) { this.state = null; this.order = null; }
      if (!this.state) {
        this.state = new WorkspaceNodePriorityState(initial?.nodes ?? readDesktopIndexNodes(this.sqlite), defaultPriority);
        this.order = initial?.order ? [...initial.order] : null;
      } else this.update();
      this.state.setDefaultPriority(defaultPriority);
      this.order ??= this.projectOrder();
      clearDesktopNodeIndexChanges(this.sqlite);
      this.version = version;
      return this.view();
    }).immediate();
  }

  private update() {
    const ids = (this.sqlite.prepare('SELECT id FROM temp.desktop_node_index_changes').all() as { id: string }[])
      .map(row => row.id);
    if (ids.length) {
      const nodes = readDesktopIndexNodes(this.sqlite, ids);
      const found = new Set(nodes.map(node => node.id));
      if (this.state!.update(nodes, ids.filter(id => !found.has(id)))) this.order = null;
    }
    if (this.sqlite.prepare('SELECT 1 FROM temp.desktop_node_index_order_dirty LIMIT 1').get()) this.order = null;
  }

  available() {
    return this.state && this.order && this.dataVersion() === this.version && !desktopNodeIndexHasChanges(this.sqlite)
      ? this.view() : null;
  }

  view() {
    return { metadata: this.state!.metadata, priorities: this.state!.priorities,
      paths: this.state!.paths, nodeOrder: this.order! };
  }

  private projectOrder() {
    const members = Array.from(this.state!.metadata.values(), node => ({ id: node.id, parent_id: node.parentNodeId,
      created_at: node.createdAt!, deleted_at: node.deletedAt ?? null }));
    return projectParentChildOrder(members, readParentChildOrders(createBetterSqlite3Driver(this.sqlite)));
  }

  private dataVersion() { return this.sqlite.pragma('data_version', { simple: true }) as number; }
}

export function prepareDesktopNodeIndex(sqlite: Database, priority: RegularPushQueuePriority, initial?: InitialNodes) {
  let owner = owners.get(sqlite);
  if (!owner) { owner = new DesktopNodeIndex(sqlite); owners.set(sqlite, owner); }
  return owner.prepare(priority, initial);
}

export function readDesktopNodeIndex(sqlite: Database) { return owners.get(sqlite)?.available() ?? null; }

export function hasDesktopNodeIndex(sqlite: Database) { return owners.has(sqlite); }

export function releaseDesktopNodeIndex(sqlite: Database) { owners.delete(sqlite); }
