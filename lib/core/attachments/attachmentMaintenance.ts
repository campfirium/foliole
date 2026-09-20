import type {
  AttachmentFileEntry, AttachmentMaintenanceRequest, AttachmentMaintenanceStatus, AttachmentObservationState
} from '../../platform/attachmentMaintenanceContract.js';

export interface AttachmentMaintenancePort {
  generation(): Promise<string>;
  references(): Promise<{ revision: string; storageKeys: string[] }>;
  inventory(trash: boolean): Promise<AttachmentFileEntry[]>;
  readState(): Promise<AttachmentObservationState | null>;
  writeState(state: AttachmentObservationState): Promise<void>;
  withStableRevision<T>(revision: string, action: () => Promise<T>): Promise<T>;
  move(storageKey: string, toTrash: boolean): Promise<void>;
  removeTrash(storageKey: string): Promise<void>;
}

export async function maintainAttachments(
  port: AttachmentMaintenancePort, request: AttachmentMaintenanceRequest, day: string, signal?: AbortSignal
): Promise<AttachmentMaintenanceStatus> {
  const generation = await port.generation();
  const stored = await port.readState();
  validateObservationState(stored);
  const state = stateForGeneration(stored, generation);
  if (request.action === 'configure') {
    const threshold = request.settings.observationThreshold;
    if (!Number.isSafeInteger(threshold) || threshold < 1 || typeof request.settings.automatic !== 'boolean') {
      throw new Error('attachment_maintenance_settings_invalid');
    }
    Object.assign(state, request.settings);
    await port.writeState(state);
  }
  if (request.action === 'restore') {
    for (const key of request.storageKeys) { signal?.throwIfAborted(); await port.move(key, false); delete state.counts[key]; }
    await port.writeState(state);
  }
  if (request.action === 'empty-trash') {
    for (const file of await port.inventory(true)) { signal?.throwIfAborted(); await port.removeTrash(file.storageKey); }
  }
  if (request.action === 'observe' || request.action === 'clean') {
    await observeAndClean(port, state, request.action, day, signal);
  }
  return status(port, state);
}

function validateObservationState(state: AttachmentObservationState | null) {
  if (state === null) return;
  if (!state || typeof state !== 'object' || typeof state.databaseGeneration !== 'string'
    || typeof state.automatic !== 'boolean' || !Number.isSafeInteger(state.observationThreshold)
    || state.observationThreshold < 1 || (state.lastObservationDay !== null && typeof state.lastObservationDay !== 'string')
    || !state.counts || typeof state.counts !== 'object' || Array.isArray(state.counts)
    || !Object.values(state.counts).every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new Error('attachment_observation_state_invalid');
  }
}

function stateForGeneration(stored: AttachmentObservationState | null, generation: string): AttachmentObservationState {
  return { automatic: stored?.automatic ?? false, observationThreshold: stored?.observationThreshold ?? 30,
    databaseGeneration: generation, lastObservationDay: stored?.lastObservationDay ?? null,
    counts: stored?.databaseGeneration === generation ? { ...stored.counts } : {} };
}

async function observeAndClean(port: AttachmentMaintenancePort, state: AttachmentObservationState,
  action: 'observe' | 'clean', day: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const snapshot = await port.references();
  const files = await port.inventory(false);
  const references = new Set(snapshot.storageKeys);
  const increment = action === 'observe' && state.lastObservationDay !== day;
  const counts: Record<string, number> = {};
  for (const file of files) {
    counts[file.storageKey] = references.has(file.storageKey) ? 0 : (state.counts[file.storageKey] ?? 0) + Number(increment);
  }
  signal?.throwIfAborted();
  await port.withStableRevision(snapshot.revision, async () => {
    if (await port.generation() !== state.databaseGeneration) throw new Error('attachment_scan_database_replaced');
    state.counts = counts;
    if (increment) state.lastObservationDay = day;
    await port.writeState(state);
  });
  if (action === 'clean' || (increment && state.automatic)) {
    for (const file of files.filter((entry) => counts[entry.storageKey]! >= state.observationThreshold)) {
      signal?.throwIfAborted();
      await port.withStableRevision(snapshot.revision, async () => {
        if (await port.generation() !== state.databaseGeneration) throw new Error('attachment_scan_database_replaced');
        await port.move(file.storageKey, true);
      });
      delete state.counts[file.storageKey];
      await port.writeState(state);
    }
  }
}

async function status(port: AttachmentMaintenancePort, state: AttachmentObservationState): Promise<AttachmentMaintenanceStatus> {
  const [files, trash] = await Promise.all([port.inventory(false), port.inventory(true)]);
  return { automatic: state.automatic, observationThreshold: state.observationThreshold,
    usedBytes: [...files, ...trash].reduce((sum, file) => sum + file.sizeBytes, 0),
    eligibleBytes: files.filter((file) => (state.counts[file.storageKey] ?? 0) >= state.observationThreshold)
      .reduce((sum, file) => sum + file.sizeBytes, 0),
    trashBytes: trash.reduce((sum, file) => sum + file.sizeBytes, 0), trash,
    lastObservationDay: state.lastObservationDay };
}
