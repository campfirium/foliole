import type { DbPort } from './dbPort.js';

interface ParentChange {
  id: string;
  parent_id: string | null;
  exists_locally: number;
  local_parent_id: string | null;
}

export async function assertValidSyncPackParentChanges(port: DbPort, candidates: ParentChange[]) {
  const moved = candidates.filter((node) => node.exists_locally && node.parent_id !== node.local_parent_id);
  if (moved.length === 0) return;
  const local = await port.query<{ id: string; parent_id: string | null }>('SELECT id, parent_id FROM main.nodes');
  const parents = new Map(local.map((node) => [node.id, node.parent_id]));
  for (const node of candidates) parents.set(node.id, node.parent_id);
  const checked = new Set<string>();
  for (const node of moved) assertParentChain(node.id, parents, checked);
}

function assertParentChain(start: string, parents: Map<string, string | null>, checked: Set<string>) {
  const chain = new Set<string>();
  let id: string | null = start;
  while (id !== null && !checked.has(id)) {
    if (chain.has(id)) throw new Error('sync_pack_node_parent_cycle');
    chain.add(id);
    const parent: string | null | undefined = parents.get(id);
    if (parent === undefined || (parent !== null && !parents.has(parent))) {
      throw new Error(`sync_pack_node_parent_missing:${id}`);
    }
    id = parent;
  }
  for (const visited of chain) checked.add(visited);
}
