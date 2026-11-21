import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import type { PdfReaderSessionReport } from '../../../../features/pdf/model/pdfReaderSession';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import { companionActivityKinds, pendingCompanionActivityTimings, subscribeCompanionActivityTimings } from './companionActivityTiming';
import { attachmentTimingKinds, pendingCompanionAttachmentTimings, subscribeCompanionAttachmentTimings } from './companionAttachmentTiming';
import { countWholeLibraryWork } from './companionWholeLibraryWork';

const mutationKinds = ['trash', 'structure', 'content', 'review', 'reading', 'state', 'full'] as const;
export const slowOperationNames = [
  ...mutationKinds.map(kind => `mutation.${kind}` as const),
  ...companionActivityKinds,
  ...attachmentTimingKinds.map(kind => `attachment.${kind}` as const),
  'reader.open'
] as const;
type SlowOperationName = typeof slowOperationNames[number];

type ReaderCounts = Omit<PdfReaderSessionReport, 'startedAt' | 'endedAt'> & { sessionMs: number };
const readerCountFields = ['sessionMs', 'sourceResolutions', 'documentLoads', 'textLayerRenders', 'textLayerRebuilds'] as const;

/**
 * Only counts and fixed names: no titles, text, paths or node ids ever reach an entry.
 * `overlapped` warns that other timed work ran in the same span, so its whole-library counts may belong to that work.
 */
export type SlowOperation = {
  operation: SlowOperationName; status: 'done' | 'failed'; durationMs: number; queueMs?: number; scopeNodes?: number;
  nodes: number | null; attachments: number | null; fullReads: number; fullRefreshes: number; occurredAt: string;
  overlapped?: true; reader?: ReaderCounts;
};
export type SlowOperationReport = { thresholdsMs: typeof slowOperationThresholdsMs; entries: SlowOperation[]; omitted: number };

export const slowOperationThresholdsMs = { interactive: 500, background: 1500, reader: 3000, round: 30_000 } as const;
const roundKinds: readonly string[] = ['sync', 'folder-backup'];
const interactiveKinds: readonly string[] = ['workspace-refresh', 'read-intent'];
const maxEntries = 40;
const retentionMs = 3 * 86_400_000;
const persistDelayMs = 1000;
const storageKey = 'foliole-slow-operations';
const spanCapacity = 64;

let entries: SlowOperation[] | undefined;
let omitted = 0;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
// Recently finished timed work, kept only to tell whether a slow span shared its time with other work.
const recentSpans: { startedAt: number; endedAt: number }[] = [];
const libraryScale = new WeakMap<WorkspaceSnapshot, { nodes: number; attachments: number }>();

export function slowOperationThreshold(operation: SlowOperationName) {
  if (operation === 'reader.open') return slowOperationThresholdsMs.reader;
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

/** Records an open PDF original only when it reloaded, redrew text layers in place, or showed its first page late. */
export function recordCompanionReaderSession(report: PdfReaderSessionReport) {
  const sessionMs = Math.max(0, Math.round(report.endedAt - report.startedAt));
  const amplified = report.sourceResolutions > 1 || report.documentLoads > 1 || report.textLayerRebuilds > 0;
  const durationMs = report.firstPageMs ?? sessionMs;
  if (!amplified && (report.firstPageMs ?? 0) < slowOperationThresholdsMs.reader) return;
  const { startedAt, endedAt, ...counts } = report;
  pushEntry({ operation: 'reader.open', status: report.documentLoads > 0 ? 'done' : 'failed', durationMs,
    ...libraryFacts(startedAt, endedAt), reader: { ...counts, sessionMs } });
}

function recordSlowOperation(operation: SlowOperationName, startedAt: number, status: 'done' | 'failed',
  extra: Pick<SlowOperation, 'queueMs' | 'scopeNodes'> = {}) {
  const endedAt = performance.now();
  const durationMs = Math.max(0, Math.round(endedAt - startedAt));
  const slow = durationMs >= slowOperationThreshold(operation);
  const overlapped = slow && sharedSpan(startedAt, endedAt);
  if (recentSpans.length === spanCapacity) recentSpans.shift();
  recentSpans.push({ startedAt, endedAt });
  if (!slow) return;
  pushEntry({ operation, status, durationMs, ...extra, ...libraryFacts(startedAt, endedAt), ...(overlapped ? { overlapped } : {}) });
}

function sharedSpan(startedAt: number, endedAt: number) {
  return recentSpans.some(span => span.startedAt < endedAt && span.endedAt > startedAt)
    || [...pendingCompanionActivityTimings(), ...pendingCompanionAttachmentTimings()].some(timing => timing.startedAt < endedAt);
}

function libraryFacts(startedAt: number, endedAt: number) {
  const scale = readLibraryScale(companionWorkspaceSnapshots.getSnapshot());
  return { nodes: scale?.nodes ?? null, attachments: scale?.attachments ?? null,
    fullReads: countWholeLibraryWork('full-read', startedAt, endedAt),
    fullRefreshes: countWholeLibraryWork('full-refresh', startedAt, endedAt), occurredAt: minuteStamp(Date.now()) };
}

function pushEntry(entry: SlowOperation) {
  const list = loadEntries();
  if (list.length === maxEntries) { list.shift(); omitted += 1; }
  list.push(entry);
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
    && typeof entry.occurredAt === 'string' && !Number.isNaN(Date.parse(entry.occurredAt))
    && (entry.overlapped === undefined || entry.overlapped === true) && (entry.reader === undefined || validReader(entry.reader));
}

function validReader(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const reader = value as Record<string, unknown>;
  const count = (field: unknown) => Number.isSafeInteger(field) && (field as number) >= 0;
  return Object.keys(reader).length === readerCountFields.length + 1 && readerCountFields.every(field => count(reader[field]))
    && (reader.firstPageMs === null || count(reader.firstPageMs));
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

export function resetCompanionSlowOperationsForTests(options: { keepStorage?: boolean } = {}) {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  entries = undefined;
  omitted = 0;
  recentSpans.length = 0;
  if (options.keepStorage) return;
  try { localStorage.removeItem(storageKey); } catch { /* No store in this environment. */ }
}
