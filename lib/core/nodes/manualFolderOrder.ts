import { isReadwiseUnlocatedNodeId } from '../readwise/readwiseBookUnlocated.js';

/** Recorded manual members first, then normalized names, with unlocated items last. */
export function sortManualFolderNodes<T extends { id: string; title: string }>(
  nodes: T[], manualChildOrder: readonly string[] | null | undefined
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = (manualChildOrder ?? []).flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  const listed = new Set(ordered.map((node) => node.id));
  const remaining = nodes.filter((node) => !listed.has(node.id)).sort((left, right) => {
    const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
    return normalize(left.title).localeCompare(normalize(right.title), undefined,
      { numeric: true, sensitivity: 'base' }) || left.id.localeCompare(right.id);
  });
  const result = [...ordered, ...remaining];
  return [...result.filter((node) => !isReadwiseUnlocatedNodeId(node.id)),
    ...result.filter((node) => isReadwiseUnlocatedNodeId(node.id))];
}
