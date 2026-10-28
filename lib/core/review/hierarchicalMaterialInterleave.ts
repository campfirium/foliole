import { mergeMaterialGroups, type MaterialGroupEntry } from './balancedMaterialMerge.js';
import { MaterialInterleaveHeap } from './materialInterleaveHeap.js';

interface MaterialPath { id?: string; pathNodeIds?: readonly string[] }
interface Branch<T> { children: Map<string, Branch<T>>; entries: T[] }
interface Partition<T> { entries: MaterialGroupEntry<T>[]; rank: number }

function mergeBranches<T>(groups: readonly T[][]): T[] {
  if (groups.length === 1) return groups[0]!;
  // Every source is already distinct; preserve urgency rather than reshuffling
  // an already dispersed list (also the common wide-root library case).
  if (groups.every(group => group.length === 1)) return groups.map(group => group[0]!);
  const heap = new MaterialInterleaveHeap<Partition<T>>((a, b) => a.entries.length - b.entries.length || a.rank - b.rank);
  groups.forEach((entries, rank) => {
    const source = {};
    heap.push({ entries: entries.map(entry => ({ entry, source })), rank });
  });
  // Merge the smallest partitions first, so a wide directory does not repeatedly
  // copy a growing queue once per child. Each merge preserves each child's order.
  while (heap.size > 1) {
    const left = heap.pop();
    const right = heap.pop();
    heap.push({ entries: mergeMaterialGroups(left.entries, right.entries), rank: Math.min(left.rank, right.rank) });
  }
  return heap.size === 0 ? [] : heap.pop().entries.map(item => item.entry);
}

export function interleaveMaterialHierarchy<T extends MaterialPath>(entries: readonly T[]): T[] {
  const root: Branch<T> = { children: new Map(), entries: [] };
  const branches = [root];
  for (const entry of entries) {
    const path = entry.pathNodeIds ?? [];
    // The final UUID identifies the item; its ancestor chain identifies source.
    const ancestors = path.length > 1 ? path.slice(0, -1) : path;
    let branch = root;
    for (const id of ancestors) {
      let child = branch.children.get(id);
      if (!child) {
        child = { children: new Map(), entries: [] };
        branch.children.set(id, child);
        branches.push(child);
      }
      branch = child;
    }
    branch.entries.push(entry);
  }
  // An iterative postorder also handles deeply nested libraries without relying
  // on the JavaScript call-stack limit.
  for (let index = branches.length - 1; index >= 0; index--) {
    const branch = branches[index]!;
    const groups = [...branch.children.values()].map(child => child.entries);
    if (branch.entries.length > 0) groups.unshift(branch.entries);
    branch.entries = mergeBranches(groups);
    branch.children.clear();
  }
  return root.entries;
}
