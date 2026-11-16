import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

type Row = NativeSuperMemoPreviewRow;
type Parents = Map<number, number | null>;

function directoryParents(rows: readonly Row[]): Parents {
  const groupRoots = new Set(rows.map(row => row.sourceConceptFolderId));
  const byId = new Map(rows.map(row => [row.id, row]));
  const destinations = new Map<number, { content: number | null; folder: number | null }>();
  const parents: Parents = new Map();
  for (const row of rows) {
    const group = row.sourceConceptFolderId ?? null;
    const inSameGroup = row.parentId !== null && (byId.get(row.parentId)?.sourceConceptFolderId ?? null) === group;
    const parent = inSameGroup ? destinations.get(row.parentId!) : undefined;
    const folder = parent?.folder ?? group;
    const content = parent?.content ?? group;
    const isFolder = row.outcome === 'folder';
    parents.set(row.id, groupRoots.has(row.id) ? null : isFolder ? folder : content);
    destinations.set(row.id, {
      content: isFolder || row.outcome === 'topic' ? row.id : content,
      folder: isFolder ? row.id : folder
    });
  }
  return parents;
}

function hasAncestor(parents: Parents, id: number, target: number) {
  for (let ancestor = parents.get(id); ancestor != null; ancestor = parents.get(ancestor)) {
    if (ancestor === target) return true;
  }
  return false;
}

export function planSuperMemoImportParents(rows: readonly Row[]): Parents {
  const parents = directoryParents(rows);
  const topics = new Set(rows.filter(row => row.outcome === 'topic').map(row => row.id));
  const directTopicChildren = new Set(rows.filter(row => (row.outcome === 'item' || row.outcome === 'topic') &&
    row.parentId != null && topics.has(row.parentId)).map(row => row.id));
  for (const row of rows) {
    if (directTopicChildren.has(row.id)) parents.set(row.id, row.parentId);
  }
  for (const row of rows) {
    if (directTopicChildren.has(row.id)) continue;
    const article = row.sourceArticleId;
    if ((row.outcome !== 'topic' && row.outcome !== 'item') || article == null || article === row.id ||
        !topics.has(article) || hasAncestor(parents, row.id, article) || hasAncestor(parents, article, row.id)) {
      continue;
    }
    parents.set(row.id, article);
  }
  return parents;
}

export function orderSuperMemoImportWrites<T extends { row: Row }>(entries: readonly T[], parents: Parents): T[] {
  const children = new Map<number | null, T[]>();
  for (const entry of entries) {
    const parent = parents.get(entry.row.id) ?? null;
    const siblings = children.get(parent) ?? [];
    siblings.push(entry);
    children.set(parent, siblings);
  }
  const ordered: T[] = [];
  const pending = [...children.get(null) ?? []].reverse();
  while (pending.length) {
    const entry = pending.pop()!;
    ordered.push(entry);
    pending.push(...[...children.get(entry.row.id) ?? []].reverse());
  }
  if (ordered.length !== entries.length) throw new Error('invalid_supermemo_import_tree');
  return ordered;
}

export function orderSuperMemoSourceRows(rows: readonly Row[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const children = new Map<number | null, number[]>();
  for (const row of rows) {
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row.id);
    children.set(row.parentId, siblings);
  }
  const ordered: Row[] = [];
  const pending = [...children.get(null) ?? []].reverse();
  while (pending.length) {
    const row = byId.get(pending.pop()!)!;
    ordered.push(row);
    pending.push(...[...row.sourceChildren ?? children.get(row.id) ?? []].reverse());
  }
  return ordered;
}
