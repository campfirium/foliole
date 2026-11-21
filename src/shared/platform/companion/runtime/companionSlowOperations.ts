import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import { companionActivityKinds, subscribeCompanionActivityTimings } from './companionActivityTiming';
import { attachmentTimingKinds, subscribeCompanionAttachmentTimings } from './companionAttachmentTiming';
import { countWholeLibraryWork } from './companionWholeLibraryWork';

const mutationKinds = ['trash', 'structure', 'content', 'review', 'reading', 'state', 'full'] as const;
export const slowOperationNames = [
  ...mutationKinds.map(kind => `mutation.${kind}` as const),
  ...companionActivityKinds,
  ...attachmentTimingKinds.map(kind => `attachment.${kind}` as const)
] as const;
type SlowOperationName = typeof slowOperationNames[number];

/** Only counts and fixed names: no titles, text, paths or node ids ever reach an entry. */
export type SlowOperation = {
  operation: SlowOperationName; status: 'done' | 'failed'; durationMs: number; queueMs?: number; scopeNodes?: number;
  nodes: number | null; attachments: number | null; fullReads: number; fullRefreshes: number; occurredAt: string;
};
export type SlowOperationReport = { thresholdsMs: typeof slowOperationThresholdsMs; entries: SlowOperation[]; omitted: number };

export const slowOperationThresholdsMs = { interactive: 500, background: 1500, round: 30_000 } as const;
const roundKinds: readonly string[] = ['sync', 'folder-backup'];
const interactiveKinds: readonly string[] = ['workspace-refresh', 'read-intent'];
const maxEntries = 40;
const retentionMs = 3 * 86_400_000;
const persistDelayMs = 1000;
const storageKey = 'foliole-slow-operations';

let entries: SlowOperation[] | undefined;
let omitted = 0;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const libraryScale = new WeakMap<WorkspaceSnapshot, { nodes: number; attachments: number }>();

export function slowOperationThreshold(operation: SlowOperationName) {
  if (operation.startsWith('mutation.') || interactiveKinds.includes(operation)) return slowOperationThresholdsMs.interactive;
  return roundKinds.includes(operation) ? slowOperationThresholdsMs.round : slowOperationThresholdsMs.background;
}

/** Records slow background work, Trash moves and refreshes from the timings the runtime already publishes. */
export function installCompanionSlowOperationLog() {
  const stopActivities = subscribeCompanionActivityTimings(({ kind, startedAt }, completion) =>
    recordSlowOperation(kind, startedAt, completion.status));
  const stopAttachments = subscribeCompanionAttachmentTimings(({ kind, startedAt }, status) =>
    recordSlowOperation(`attachment.${kind}`, startedAt, status));
  return () => { stopActivities(); stopAttachments(); };
}

/** Called once per committed or failed workspace mutation from the shared mutation entry. */
export function recordCompanionMutationTiming(scope: WorkspaceRefreshScope | undefined, queuedAt: number, startedAt: number,
  status: 'done' | 'failed') {
  const scopeNodes = scope?.kind === 'nodes'
    ? new Set([...scope.nodeIds, ...scope.reviewNodeIds ?? [], ...scope.readingNodeIds ?? []]).size : undefined;
  recordSlowOperation(`mutation.${mutationKind(scope)}`, queuedAt, status,
    { queueMs: Math.max(0, Math.round(startedAt - queuedAt)), ...(scopeNodes === undefined ? {} : { scopeNodes }) });
}

function mutationKind(scope: WorkspaceRefreshScope | undefined): typeof mutationKinds[number] {
  if (!scope || scope.kind === 'full') return 'full';
  if (scope.trash) return 'trash';
  if (scope.structure) return 'structure';
  if (scope.nodeIds.length) return 'content';
  if (scope.reviewNodeIds?.length) return 'review';
  if (scope.readingNodeIds?.length) return 'reading';
  return 'state';
}

function recordSlowOperation(operation: SlowOperationName, startedAt: number, status: 'done' | 'failed',
  extra: Pick<SlowOperation, 'queueMs' | 'scopeNodes'> = {}) {
  const endedAt = performance.now();
  const durationMs = Math.max(0, Math.round(endedAt - startedAt));
  if (durationMs < slowOperationThreshold(operation)) return;
  const scale = readLibraryScale(companionWorkspaceSnapshots.getSnapshot());
  const list = loadEntries();
  if (list.length === maxEntries) { list.shift(); omitted += 1; }
  list.push({ operation, status, durationMs, ...extra, nodes: scale?.nodes ?? null, attachments: scale?.attachments ?? null,
    fullReads: countWholeLibraryWork('full-read', startedAt, endedAt),
    fullRefreshes: countWholeLibraryWork('full-refresh', startedAt, endedAt), occurredAt: minuteStamp(Date.now()) });
  schedulePersist();
}

/** Counts come from the snapshot already in memory, once per snapshot, so a slow entry never reads the library. */
function readLibraryScale(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot) return null;
  let scale = libraryScale.get(snapshot);
  if (!scale) {
    let nodes = 0;
    let attachments = 0;
    for (const id in snapshot.nodesById) { nodes += 1; attachments += snapshot.nodesById[id]?.attachments?.length ?? 0; }
    scale = { nodes, attachments };
    libraryScale.set(snapshot, scale);
  }
  return scale;
}

function minuteStamp(ms: number) {
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

export function readCompanionSlowOperations(): SlowOperationReport {
  const list = prune(loadEntries());
  return { thresholdsMs: slowOperationThresholdsMs, entries: list.map(entry => ({ ...entry })), omitted };
}

function prune(list: SlowOperation[]) {
  const cutoff = Date.now() - retentionMs;
  const kept = list.filter(entry => Date.parse(entry.occurredAt) >= cutoff);
  if (kept.length !== list.length) { list.splice(0, list.length, ...kept); schedulePersist(); }
  return list;
}

function loadEntries() {
  if (entries) return entries;
  entries = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    const record = saved && typeof saved === 'object' ? saved as { entries?: unknown; omitted?: unknown } : null;
    if (Array.isArray(record?.entries)) entries = record.entries.filter(validEntry).slice(-maxEntries);
    if (Number.isSafeInteger(record?.omitted) && (record!.omitted as number) >= 0) omitted = record!.omitted as number;
  } catch {
    // An unreadable store starts an empty log; slow work is still recorded for this session.
  }
  return entries;
}

function validEntry(value: unknown): value is SlowOperation {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const count = (field: unknown) => Number.isSafeInteger(field) && (field as number) >= 0;
  const nullableCount = (field: unknown) => field === null || count(field);
  return slowOperationNames.includes(entry.operation as SlowOperationName)
    && (entry.status === 'done' || entry.status === 'failed') && count(entry.durationMs)
    && (entry.queueMs === undefined || count(entry.queueMs)) && (entry.scopeNodes === undefined || count(entry.scopeNodes))
    && nullableCount(entry.nodes) && nullableCount(entry.attachments) && count(entry.fullReads) && count(entry.fullRefreshes)
    && typeof entry.occurredAt === 'string' && !Number.isNaN(Date.parse(entry.occurredAt));
}

// One write per burst: a run of slow work must not turn into a run of storage writes.
function schedulePersist() {
  if (persistTimer !== undefined) return;
  persistTimer = setTimeout(flushCompanionSlowOperations, persistDelayMs);
}

export function flushCompanionSlowOperations() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  if (!entries) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ entries, omitted }));
  } catch {
    // The in-memory log stays exportable for this session.
  }
}

export function resetCompanionSlowOperationsForTests() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  entries = undefined;
  omitted = 0;
  try { localStorage.removeItem(storageKey); } catch { /* No store in this environment. */ }
}
