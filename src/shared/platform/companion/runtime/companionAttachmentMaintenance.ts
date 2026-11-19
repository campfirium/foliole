import { maintainAttachments, type AttachmentMaintenancePort } from '../../../../../lib/core/attachments/attachmentMaintenance';
import { requeueMissingObservedAttachments } from '../../../../../lib/core/attachments/attachmentReferenceCache';
import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import { requeueMissingAttachmentArticles } from '../../../../../lib/core/sync/attachmentDemandQueue.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { AttachmentMaintenanceResult, AttachmentMaintenanceStatus, AttachmentObservationRequest,
  AttachmentObservationResult, AttachmentStatusRequest, AttachmentMaintenanceRequest, AttachmentObservationState } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { companionAttachmentFileOperation } from './companionAttachmentFileOperation';
import { readCompanionObservationReferences } from './companionAttachmentObservation';
import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

// Native observation state is shared even when the database owner changes.
let maintenanceTail: Promise<unknown> = Promise.resolve();

export function runWithCompanionAttachmentMaintenance<T>(action: () => Promise<T>): Promise<T> {
  const run = maintenanceTail.then(action);
  maintenanceTail = run.catch(() => undefined);
  return run;
}

export function runCompanionAttachmentMaintenance(request: AttachmentObservationRequest, signal?: AbortSignal): Promise<AttachmentObservationResult>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentStatusRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceStatus>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceResult>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const owner = getIosCompanionDatabaseOwner();
  return runWithCompanionAttachmentMaintenance(() => maintain(owner, request, signal));
}

function maintain(owner: CapacitorCompanionDatabaseOwner, request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const files = FolioleCompanionSync.maintainAttachmentFiles.bind(FolioleCompanionSync);
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const assertOwner = () => {
    signal?.throwIfAborted();
    if (getIosCompanionDatabaseOwner() !== owner) throw new Error('attachment_scan_database_replaced');
  };
  const generation = async () => {
    assertOwner();
    const result = await files({ operation: 'generation', databasePath: owner.databasePath });
    assertOwner();
    if (!result.generation) throw new Error('attachment_database_generation_missing');
    return result.generation;
  };
  const writeState = async (state: AttachmentObservationState) => {
    assertOwner();
    await files({ operation: 'write-state', state: JSON.stringify(state) });
    assertOwner();
  };
  const revision = companionAttachmentRevisionGuard(owner, assertOwner);
  const updateAvailability = companionAttachmentFileOperation(owner, files, revision.write, signal);
  return maintainAttachments({
    generation,
    references: () => request.action === 'observe'
      ? readCompanionObservationReferences(owner, generation, signal) : readCompanionAttachmentReferences(owner, signal),
    inventory: async (trash) => {
      const result = await files({ operation: 'inventory', trash });
      if (!result.files) throw new Error('attachment_inventory_missing');
      return result.files;
    },
    readState: async () => {
      const { state } = await files({ operation: 'read-state' });
      return state ? JSON.parse(state) as AttachmentObservationState : null;
    },
    writeState,
    recordObservation: async (snapshotRevision, state, missing) => {
      if (await generation() !== state.databaseGeneration) throw new Error('attachment_scan_database_replaced');
      if (missing.length) {
        const requeue = request.action === 'observe' ? requeueMissingObservedAttachments : requeueMissingAttachmentArticles;
        await revision.commit(snapshotRevision, db => requeue(db, missing));
      } else await owner.read(db => revision.check(db, snapshotRevision));
      // Counts are advisory. A later move still has to revalidate the reference revision.
      await writeState(state);
    },
    withStableRevision: revision.withStableRevision,
    move: (storageKey, trash) => updateAvailability('move', storageKey, trash),
    removeTrash: (storageKey) => updateAvailability('remove-trash', storageKey)
  }, request, day, signal);
}

function companionAttachmentRevisionGuard(owner: CapacitorCompanionDatabaseOwner, assertOwner: () => void) {
  let activeDb: DbPort | undefined;
  let expectedRevision: string | undefined;
  const check = async (db: DbPort, snapshotRevision: string) => {
    assertOwner();
    if ((expectedRevision ?? snapshotRevision) !== await attachmentDatabaseRevision(db)) {
      throw new Error('attachment_scan_database_changed');
    }
    assertOwner();
  };
  const commit = <T>(snapshotRevision: string, action: (db: DbPort) => Promise<T>) => owner.runWriterSequence(async (db, commitWrite) => {
    const result = await commitWrite(async tx => {
      await check(tx, snapshotRevision);
      return action(tx);
    });
    expectedRevision = await attachmentDatabaseRevision(db);
    return result;
  });
  const withStableRevision: AttachmentMaintenancePort['withStableRevision'] = (snapshotRevision, action) =>
    commit(snapshotRevision, async tx => {
      activeDb = tx;
      try { return await action(); }
      finally { activeDb = undefined; }
    });
  return { check, commit, withStableRevision,
    write: <T>(action: (db: DbPort) => Promise<T>) => activeDb ? action(activeDb) : owner.runWriter(action) };
}
