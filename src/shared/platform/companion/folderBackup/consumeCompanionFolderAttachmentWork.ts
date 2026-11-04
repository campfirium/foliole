import { configureFolderAttachmentProfile, confirmFolderAttachmentCopy, countFolderAttachmentWork,
  failFolderAttachmentCopy, readFolderAttachmentWork, seedFolderAttachmentBaseline, type FolderAttachmentWork } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

interface Source {
  write<T>(execute: (db: DbPort) => Promise<T>): Promise<T>;
  inventory(): Promise<{ files?: { storageKey: string; sizeBytes: number }[] }>;
}

/** One serialized backup request consumes known work; scheduling and user consent remain outside this consumer. */
export async function consumeCompanionFolderAttachmentWork(port: CompanionFolderBackupPort, source: Source,
  input: { requestId: string; sourceEpoch: string; profile: string; deletions?: FolderAttachmentWork[]; continueWork?: () => boolean }) {
  let copied = 0;
  let pending: number | null = null;
  let errorMessage: string | null = null;
  try {
    if (input.continueWork && !input.continueWork()) return port.finishAttachments({
      requestId: input.requestId, copied, pending, errorMessage
    });
    if (!input.profile) throw new Error('Backup folder identity is missing.');
    const initialized = await source.write(db => configureFolderAttachmentProfile(db, input.profile));
    if (!initialized) {
      const inventory = await source.inventory();
      if (!inventory.files) throw new Error('Cannot read the attachment directory.');
      await source.write(db => seedFolderAttachmentBaseline(db, input.profile, inventory.files!.map(file => file.storageKey)));
    }
    await port.prepareAttachmentDirectory(input);
    const work = await source.write(db => readFolderAttachmentWork(db, input.profile));
    for (const entry of work) {
      if (input.continueWork && !input.continueWork()) break;
      // A failed source deletion (or a later restore) can be discharged only by verifying the original and its copy.
      if (entry.action === 'delete' && entry.stage === 'source') {
        try {
          const result = await port.copyAttachment({ ...input, storageKey: entry.storage_key });
          if (result.copied) copied += 1;
          await source.write(db => confirmFolderAttachmentCopy(db, input.profile, entry));
          continue;
        } catch { /* An absent original is deletable only with this request's committed snapshot permission. */ }
      }
      if (entry.action === 'delete' && !input.deletions?.some(candidate => candidate.storage_key === entry.storage_key
        && candidate.token === entry.token && candidate.stage === entry.stage)) continue;
      try {
        if (entry.action === 'delete') await port.deleteAttachment({ ...input, storageKey: entry.storage_key });
        else {
          const result = await port.copyAttachment({ ...input, storageKey: entry.storage_key });
          if (result.copied) copied += 1;
        }
        await source.write(db => confirmFolderAttachmentCopy(db, input.profile, entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorMessage ??= message;
        await source.write(db => failFolderAttachmentCopy(db, input.profile, entry, message));
      }
    }
    pending = await source.write(db => countFolderAttachmentWork(db, input.profile));
  } catch (error) { errorMessage = error instanceof Error ? error.message : String(error); }
  return port.finishAttachments({ requestId: input.requestId, copied, pending, errorMessage });
}
