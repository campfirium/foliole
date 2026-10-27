import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../database/specialNodeIds.js';

export function isFixedStructureRoot(id: string) {
  return [HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID].includes(id);
}

export function moveOrderChildren(parentNodeId: string | null, ids: string[]) {
  return parentNodeId === null ? ids.filter((id) => !isFixedStructureRoot(id)) : ids;
}

export function retainFixedRootSlots(existing: string[], requested: string[]) {
  const remaining = [...requested];
  const result = existing.flatMap((id) => isFixedStructureRoot(id) ? [id] : remaining.splice(0, 1));
  return [...result, ...remaining];
}
