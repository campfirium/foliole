import { sourceDay } from './superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

const DAY_MS = 86_400_000;
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

export interface SuperMemoCollectionFields {
  due: string | null;
  rank: number | null;
  children: number[];
}

interface CollectionTables {
  tree: DataView;
  elements: DataView;
  repetitions: DataView;
  priorities: DataView;
  history: DataView;
}

function requirePair(condition: unknown): asserts condition {
  if (!condition) throw new Error('supermemo_collection_mismatch');
}

function childrenOf(tree: DataView, id: number, expected: number[]) {
  const remaining = new Set(expected);
  const ordered: number[] = [];
  let child = tree.getInt32((id - 1) * 37 + 5, true);
  while (child > 0) {
    requirePair(remaining.delete(child));
    requirePair(child <= tree.byteLength / 37);
    ordered.push(child);
    child = tree.getInt32((child - 1) * 37 + 17, true);
  }
  requirePair(remaining.size === 0);
  return ordered;
}

function calendarBase(elements: SuperMemoXmlDraftElement[], data: DataView) {
  let base: number | undefined;
  for (const { id, learning } of elements) {
    const last = sourceDay(learning?.lastRepetition ?? null);
    const interval = Number(learning?.intervalDays);
    if (last === null || !interval) continue;
    const offset = (id - 1) * 118;
    requirePair(data.getUint16(offset + 16, true) === interval);
    const relative = data.getInt16(offset + 18, true);
    if (relative <= 0) continue;
    const candidate = last - relative * DAY_MS;
    requirePair(base === undefined || base === candidate);
    base = candidate;
  }
  return base;
}

function priorityRanks(priorities: DataView, ids: Set<number>) {
  requirePair(priorities.byteLength % 4 === 0);
  const ranks = new Map<number, number>();
  for (let offset = 0; offset < priorities.byteLength; offset += 4) {
    const id = priorities.getInt32(offset, true);
    requirePair(ids.has(id) && !ranks.has(id));
    ranks.set(id, offset / 4 + 1);
  }
  return ranks;
}

function validateTree(tree: DataView, elements: SuperMemoXmlDraftElement[]) {
  const parents = new Map(elements.map(element => [element.id, element.parentId]));
  let live = 0;
  for (let offset = 0; offset < tree.byteLength; offset += 37) {
    if (tree.getUint8(offset) !== 0) continue;
    const id = offset / 37 + 1;
    requirePair(parents.get(id) === (tree.getInt32(offset + 1, true) || null));
    live++;
  }
  requirePair(live === elements.length);
}

function validateHistory(elements: SuperMemoXmlDraftElement[], history: DataView) {
  requirePair(history.byteLength % 39 === 0);
  const observed = new Set<string>();
  for (let offset = 0; offset < history.byteLength; offset += 39) {
    const id = history.getInt32(offset, true);
    const repetition = history.getUint16(offset + 4, true);
    const date = Math.floor(history.getFloat64(offset + 10, true));
    const grade = history.getUint8(offset + 24);
    if (date > 30_000 && date < 60_000) observed.add(`${id}/${repetition}/${date}/${grade}`);
  }
  let matches = 0;
  let comparable = 0;
  for (const { id, learning } of elements) {
    for (const event of learning?.history ?? []) {
      const instant = sourceDay(event.date);
      if (instant === null) continue;
      comparable++;
      const date = (instant - DELPHI_EPOCH) / DAY_MS;
      if (observed.has(`${id}/${event.repetition}/${date}/${event.grade}`)) matches++;
    }
  }
  // The official XML can contain a small number of events without an identical binary row.
  requirePair(comparable > 0 && matches / comparable >= 0.99);
}

export function matchSuperMemoCollection(elements: SuperMemoXmlDraftElement[], tables: CollectionTables) {
  const { tree, elements: binary, priorities, repetitions } = tables;
  const count = tree.byteLength / 37;
  requirePair(Number.isInteger(count) && count > 0 && binary.byteLength === count * 118 &&
    repetitions.byteLength === count * 4);
  validateTree(tree, elements);
  validateHistory(elements, tables.history);
  const base = calendarBase(elements, binary);
  requirePair(base !== undefined);
  const ranks = priorityRanks(priorities, new Set(elements.map(element => element.id)));
  return new Map(elements.map(({ id, children }) => {
    const relative = repetitions.getInt32((id - 1) * 4, true);
    const due = relative > 0 && relative < 30_000
      ? new Date(base + relative * DAY_MS).toISOString().slice(0, 10) : null;
    return [id, { children: childrenOf(tree, id, children), due, rank: ranks.get(id) ?? null }];
  }));
}
