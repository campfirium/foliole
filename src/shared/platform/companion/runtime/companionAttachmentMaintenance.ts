import { maintainAttachments } from '../../../../../lib/core/attachments/attachmentMaintenance';
import { requeueMissingObservedAttachments } from '../../../../../lib/core/attachments/attachmentReferenceCache';
import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import { recordFramedSyncResourceAvailability } from '../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { requeueMissingAttachmentArticles } from '../../../../../lib/core/sync/attachmentDemandQueue.js';
import { attachmentSourceVerification } from '../../../../../lib/core/sync/attachmentSourceVerification.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { AttachmentMaintenanceResult, AttachmentMaintenanceStatus, AttachmentObservationRequest,
  AttachmentObservationResult, AttachmentStatusRequest, AttachmentMaintenanceRequest, AttachmentObservationState } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { readCompanionObservationReferences } from './companionAttachmentObservation';
import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

const maintenanceTails = new WeakMap<object, Promise<unknown>>();

export function runCompanionAttachmentMaintenance(request: AttachmentObservationRequest, signal?: AbortSignal): Promise<AttachmentObservationResult>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentStatusRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceStatus>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal): Promise<AttachmentMaintenanceResult>;
// eslint-disable-next-line no-redeclare -- Action-specific TypeScript overloads share one implementation.
export function runCompanionAttachmentMaintenance(request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
  const owner = getIosCompanionDatabaseOwner();
  const run = (maintenanceTails.get(owner) ?? Promise.resolve()).then(() => maintain(owner, request, signal));
  maintenanceTails.set(owner, run.catch(() => undefined));
  return run;
}

function maintain(owner: CapacitorCompanionDatabaseOwner, request: AttachmentMaintenanceRequest, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let activeDb: DbPort | undefined;
    let expectedRevision: string | undefined;
    const write = <T>(task: (db: DbPort) => Promise<T>) => activeDb ? task(activeDb) : owner.runWriter(task);
    const files = FolioleCompanionSync.maintainAttachmentFiles.bind(FolioleCompanionSync);
    const updateAvailability = async (operation: 'move' | 'remove-trash', storageKey: string, trash?: boolean) => {
      signal?.throwIfAborted();
      attachmentSourceVerification.invalidate(storageKey);
      const result = await files({ operation, storageKey, ...(trash === undefined ? {} : { trash }) });
      if (typeof result.available !== 'boolean') throw new Error('attachment_availability_missing');
      const available = result.available;
      await write(db => recordFramedSyncResourceAvailability(db, [storageKey.slice(0, 64)], available));
    };
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const generation = async () => {
        if (getIosCompanionDatabaseOwner() !== owner) throw new Error('attachment_scan_database_replaced');
        const result = await files({ operation: 'generation', databasePath: owner.databasePath });
        if (!result.generation) throw new Error('attachment_database_generation_missing');
        return result.generation;
    };
    return maintainAttachments({
      generation,
      references: async () => {
        const snapshot = await (request.action === 'observe'
          ? readCompanionObservationReferences(owner, generation, signal) : readCompanionAttachmentReferences(owner, signal));
        expectedRevision = snapshot?.revision;
        return snapshot;
      },
      inventory: async (trash) => {
        const result = await files({ operation: 'inventory', trash });
        if (!result.files) throw new Error('attachment_inventory_missing');
        return result.files;
      },
      readState: async () => {
        const { state } = await files({ operation: 'read-state' });
        return state ? JSON.parse(state) as AttachmentObservationState : null;
      },
      writeState: async (state) => {
        signal?.throwIfAborted();
        await files({ operation: 'write-state', state: JSON.stringify(state) });
      },
      withStableRevision: (revision, action) => owner.runWriter(db => db.transaction(async (tx) => {
        if ((expectedRevision ?? revision) !== await attachmentDatabaseRevision(tx)) throw new Error('attachment_scan_database_changed');
        signal?.throwIfAborted();
        activeDb = tx;
        try {
          const result = await action();
          expectedRevision = await attachmentDatabaseRevision(tx);
          return result;
        } finally { activeDb = undefined; }
      })),
      move: (storageKey, trash) => updateAvailability('move', storageKey, trash),
      requestMissing: (storageKeys) => write(db => (request.action === 'observe' ? requeueMissingObservedAttachments : requeueMissingAttachmentArticles)(db, storageKeys)),
      removeTrash: (storageKey) => updateAvailability('remove-trash', storageKey)
    }, request, day, signal);
}
