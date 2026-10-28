import { normalizePushQueuePriority, type PushQueuePriority, type RegularPushQueuePriority } from '../review/unifiedPushQueueRules.js';

import { updateWorkspaceNodePaths, type WorkspaceNodePaths } from './workspaceNodePaths.js';
import { createWorkspaceNodePriorityIndex } from './workspaceNodePriorityIndex.js';

export interface PriorityIndexNode {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  createdAt?: string | null;
  deletedAt?: string | null;
  kind?: string | null;
  shelvedAt?: string | null;
  hasContent?: boolean | null;
  hasReveal?: boolean | null;
}

export class WorkspaceNodePriorityState {
  private readonly nodes = new Map<string, PriorityIndexNode>();
  private readonly children = new Map<string, Set<string>>();
  private readonly values = new Map<string, PushQueuePriority>();
  private readonly pathValues = new Map<string, readonly string[]>();

  constructor(nodes: Iterable<PriorityIndexNode>, private defaultPriority: RegularPushQueuePriority) {
    for (const node of nodes) this.store(node);
    this.resolve(new Set(this.nodes.keys()));
    updateWorkspaceNodePaths(this.nodes, this.pathValues, new Set(this.nodes.keys()));
  }

  get priorities(): ReadonlyMap<string, PushQueuePriority> { return this.values; }
  get paths(): WorkspaceNodePaths { return this.pathValues; }
  get metadata(): ReadonlyMap<string, Readonly<PriorityIndexNode>> { return this.nodes; }

  setDefaultPriority(value: RegularPushQueuePriority) {
    if (value === this.defaultPriority) return;
    this.defaultPriority = value;
    this.resolve(new Set(this.nodes.keys()));
  }

  update(nodes: Iterable<PriorityIndexNode>, removed: readonly string[] = []) {
    let orderChanged = removed.length > 0;
    const roots = new Set<string>();
    const pathRoots = new Set<string>();
    for (const id of removed) {
      pathRoots.add(id);
      for (const child of this.children.get(id) ?? []) roots.add(child);
      const previous = this.nodes.get(id);
      if (previous?.parentNodeId) this.unlink(previous.parentNodeId, id);
      this.nodes.delete(id);
      this.values.delete(id);
    }
    for (const node of nodes) {
      const previous = this.nodes.get(node.id);
      const changed = !previous || previous.parentNodeId !== node.parentNodeId
        || previous.createdAt !== (node.createdAt ?? null) || previous.deletedAt !== (node.deletedAt ?? null);
      const eligibilityChanged = previous?.kind !== (node.kind ?? null)
        || previous?.shelvedAt !== (node.shelvedAt ?? null)
        || previous?.hasContent !== (node.hasContent ?? null) || previous?.hasReveal !== (node.hasReveal ?? null);
      orderChanged ||= changed;
      if (!previous || previous.parentNodeId !== node.parentNodeId) pathRoots.add(node.id);
      if (previous && previous.parentNodeId === node.parentNodeId && previous.priority === (node.priority ?? null)) {
        if (changed || eligibilityChanged) this.store(node);
        continue;
      }
      if (previous?.parentNodeId) this.unlink(previous.parentNodeId, node.id);
      this.store(node);
      roots.add(node.id);
    }
    const pending = [...roots];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      for (const child of this.children.get(pending[cursor]!) ?? []) {
        if (roots.has(child) || this.nodes.get(child)?.priority != null) continue;
        roots.add(child);
        pending.push(child);
      }
    }
    this.resolve(roots);
    const affected = [...pathRoots];
    for (let cursor = 0; cursor < affected.length; cursor++) {
      for (const child of this.children.get(affected[cursor]!) ?? []) {
        if (pathRoots.has(child)) continue;
        pathRoots.add(child);
        affected.push(child);
      }
    }
    updateWorkspaceNodePaths(this.nodes, this.pathValues, pathRoots);
    return orderChanged;
  }

  private unlink(parent: string, id: string) {
    const siblings = this.children.get(parent);
    siblings?.delete(id);
    if (!siblings?.size) this.children.delete(parent);
  }

  private store(node: PriorityIndexNode) {
    this.nodes.set(node.id, { id: node.id, parentNodeId: node.parentNodeId, priority: node.priority ?? null,
      createdAt: node.createdAt ?? null, deletedAt: node.deletedAt ?? null,
      kind: node.kind ?? null, shelvedAt: node.shelvedAt ?? null,
      hasContent: node.hasContent ?? null, hasReveal: node.hasReveal ?? null });
    if (node.parentNodeId) {
      const siblings = this.children.get(node.parentNodeId) ?? new Set<string>();
      siblings.add(node.id);
      this.children.set(node.parentNodeId, siblings);
    }
  }

  private resolve(ids: Set<string>) {
    const input: Record<string, PriorityIndexNode> = {};
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (!node) continue;
      input[id] = node;
      const parent = node.parentNodeId;
      if (parent && !ids.has(parent) && this.nodes.has(parent)) {
        input[parent] = { id: parent, parentNodeId: null,
          priority: normalizePushQueuePriority(this.values.get(parent), this.defaultPriority) };
      }
    }
    const resolved = createWorkspaceNodePriorityIndex(input, this.defaultPriority);
    for (const id of ids) if (this.nodes.has(id)) this.values.set(id, resolved.get(id)!);
  }
}
