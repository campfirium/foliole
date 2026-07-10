import type {
  WorkspaceReadingProgressSavePayload,
  WorkspaceReadingProgressSnapshot
} from './workspaceRuntimeTypes';

const STORAGE_KEY = 'foliole-pending-durable-mutations-v1';

export interface PendingDurableAck {
  revision: number;
  signature: string;
}

interface PendingEntry<T> extends PendingDurableAck {
  payload: T;
}

interface PendingDurableSnapshot {
  nextRevision: number;
  nodeOrder: PendingEntry<string[]> | null;
  readingProgress: PendingEntry<WorkspaceReadingProgressSavePayload> | null;
  relearnByNodeId: Record<string, PendingEntry<{ nodeId: string }>>;
}

function emptySnapshot(): PendingDurableSnapshot {
  return { nextRevision: 1, nodeOrder: null, readingProgress: null, relearnByNodeId: {} };
}

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function signature(value: unknown) {
  return JSON.stringify(value);
}

function isEntry<T>(value: unknown): value is PendingEntry<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<PendingEntry<T>>;
  return Number.isInteger(entry.revision) && entry.revision! > 0 && typeof entry.signature === 'string' && 'payload' in entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNodeOrderEntry(value: unknown): value is PendingEntry<string[]> {
  return isEntry<string[]>(value) && Array.isArray(value.payload) &&
    value.payload.every((nodeId) => typeof nodeId === 'string') && value.signature === signature(value.payload);
}

function isRelearnEntry(value: unknown): value is PendingEntry<{ nodeId: string }> {
  return isEntry<{ nodeId: string }>(value) && isRecord(value.payload) &&
    typeof value.payload.nodeId === 'string' && value.signature === signature(value.payload);
}

function isReadingProgressEntry(value: unknown): value is PendingEntry<WorkspaceReadingProgressSavePayload> {
  if (!isEntry<WorkspaceReadingProgressSavePayload>(value) || !isRecord(value.payload)) return false;
  const payload = value.payload;
  if (payload.activeNodeId !== null && typeof payload.activeNodeId !== 'string') return false;
  if (typeof payload.updatedAt !== 'string' || !Array.isArray(payload.nodeViewStates)) return false;
  return value.signature === signature(payload) && payload.nodeViewStates.every((state) => (
    isRecord(state) && typeof state.nodeId === 'string' && typeof state.scrollTop === 'number' &&
    (state.selectionFrom === null || typeof state.selectionFrom === 'number') &&
    (state.selectionTo === null || typeof state.selectionTo === 'number')
  ));
}

function readSnapshot(): PendingDurableSnapshot {
  const raw = getStorage()?.getItem(STORAGE_KEY);
  if (!raw) return emptySnapshot();
  try {
    const parsed = JSON.parse(raw) as Partial<PendingDurableSnapshot>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptySnapshot();
    const relearnByNodeId = parsed.relearnByNodeId && typeof parsed.relearnByNodeId === 'object'
      ? Object.fromEntries(Object.entries(parsed.relearnByNodeId).filter(([nodeId, entry]) => (
        isRelearnEntry(entry) && entry.payload.nodeId === nodeId
      )))
      : {};
    const nodeOrder = isNodeOrderEntry(parsed.nodeOrder) ? parsed.nodeOrder : null;
    const readingProgress = isReadingProgressEntry(parsed.readingProgress) ? parsed.readingProgress : null;
    const highestRevision = Math.max(0, nodeOrder?.revision ?? 0, readingProgress?.revision ?? 0,
      ...Object.values(relearnByNodeId).map((entry) => entry.revision));
    return {
      nextRevision: Math.max(
        highestRevision + 1,
        Number.isInteger(parsed.nextRevision) && parsed.nextRevision! > 0 ? parsed.nextRevision! : 1
      ),
      nodeOrder,
      readingProgress,
      relearnByNodeId
    };
  } catch {
    return emptySnapshot();
  }
}

function writeSnapshot(snapshot: PendingDurableSnapshot) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function createEntry<T>(snapshot: PendingDurableSnapshot, payload: T): PendingEntry<T> {
  const entry = { payload, revision: snapshot.nextRevision, signature: signature(payload) };
  snapshot.nextRevision += 1;
  return entry;
}

function toAck(entry: PendingDurableAck): PendingDurableAck {
  return { revision: entry.revision, signature: entry.signature };
}

function matches(entry: PendingDurableAck | null | undefined, ack: PendingDurableAck) {
  return entry?.revision === ack.revision && entry.signature === ack.signature;
}

export function stagePendingNodeOrder(nodeIds: string[]): PendingDurableAck | null {
  const snapshot = readSnapshot();
  const entry = createEntry(snapshot, [...nodeIds]);
  snapshot.nodeOrder = entry;
  return writeSnapshot(snapshot) ? toAck(entry) : null;
}

export function stagePendingRelearnNode(nodeId: string): PendingDurableAck | null {
  const snapshot = readSnapshot();
  const entry = createEntry(snapshot, { nodeId });
  snapshot.relearnByNodeId[nodeId] = entry;
  return writeSnapshot(snapshot) ? toAck(entry) : null;
}

export function stagePendingReadingProgress(payload: WorkspaceReadingProgressSavePayload): PendingDurableAck | null {
  const snapshot = readSnapshot();
  const cloned = structuredClone(payload);
  const entry = createEntry(snapshot, cloned);
  snapshot.readingProgress = entry;
  return writeSnapshot(snapshot) ? toAck(entry) : null;
}

export function resolvePendingNodeOrder(ack: PendingDurableAck) {
  const snapshot = readSnapshot();
  if (!matches(snapshot.nodeOrder, ack)) return false;
  snapshot.nodeOrder = null;
  return writeSnapshot(snapshot);
}

export function resolvePendingRelearnNode(nodeId: string, ack: PendingDurableAck) {
  const snapshot = readSnapshot();
  if (!matches(snapshot.relearnByNodeId[nodeId], ack)) return false;
  delete snapshot.relearnByNodeId[nodeId];
  return writeSnapshot(snapshot);
}

export function resolvePendingReadingProgress(ack: PendingDurableAck) {
  const snapshot = readSnapshot();
  if (!matches(snapshot.readingProgress, ack)) return false;
  snapshot.readingProgress = null;
  return writeSnapshot(snapshot);
}

export function readPendingNodeOrder() {
  return readSnapshot().nodeOrder;
}

export function readPendingRelearnNodes() {
  return Object.values(readSnapshot().relearnByNodeId).sort((left, right) => left.revision - right.revision);
}

export function readPendingReadingProgress() {
  return readSnapshot().readingProgress;
}

export function reconcilePendingNodeOrder(nodeIds: string[]) {
  const current = readSnapshot().nodeOrder;
  if (!current || current.signature === signature(nodeIds)) return current ? toAck(current) : null;
  return stagePendingNodeOrder(nodeIds);
}

export function mergePendingReadingProgress(
  current: WorkspaceReadingProgressSnapshot | null
): WorkspaceReadingProgressSnapshot | null {
  const pending = readSnapshot().readingProgress?.payload;
  if (!pending) return current;
  const nodeViewStateById = { ...(current?.nodeViewStateById ?? {}) };
  for (const state of pending.nodeViewStates) {
    const updatedAt = state.updatedAt?.trim() || pending.updatedAt;
    const currentUpdatedAt = nodeViewStateById[state.nodeId]?.updatedAt;
    if (currentUpdatedAt && updatedAt.localeCompare(currentUpdatedAt) < 0) continue;
    nodeViewStateById[state.nodeId] = {
      scrollTop: state.scrollTop,
      selectionFrom: state.selectionFrom,
      selectionTo: state.selectionTo,
      updatedAt
    };
  }
  return { activeNodeId: pending.activeNodeId, nodeViewStateById };
}

export function resetPendingDurableMutationsForTests() {
  getStorage()?.removeItem(STORAGE_KEY);
}
