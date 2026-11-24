import { configureFolderAttachmentProfile, confirmFolderAttachmentCopies, countFolderAttachmentWork,
  failFolderAttachmentCopies, readFolderAttachmentWork, seedFolderAttachmentBaseline, type FolderAttachmentWork } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_FOLDER_ATTACHMENT_COPY_BATCH, type CompanionFolderAttachmentCopyResult,
  type CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

interface Source {
  write<T>(execute: (db: DbPort) => Promise<T>): Promise<T>;
  inventory(): Promise<{ files?: { storageKey: string; sizeBytes: number }[] }>;
}
interface Input {
  requestId: string; sourceEpoch: string; profile: string; deletions?: FolderAttachmentWork[];
  continueWork?: () => boolean; stopped?: AbortSignal;
}

const cancelledMessage = 'Backup cancelled.';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** One serialized backup request consumes known work; scheduling and user consent remain outside this consumer. */
export async function consumeCompanionFolderAttachmentWork(port: CompanionFolderBackupPort, source: Source, input: Input) {
  let copied = 0;
  let pending: number | null = null;
  let errorMessage: string | null = null;
  const stopped = () => Boolean(input.stopped?.aborted || (input.continueWork && !input.continueWork()));
  try {
    if (stopped()) return port.finishAttachments({ requestId: input.requestId, copied, pending, errorMessage });
    if (!input.profile) throw new Error('Backup folder identity is missing.');
    const initialized = await source.write(db => configureFolderAttachmentProfile(db, input.profile));
    const request = { requestId: input.requestId, sourceEpoch: input.sourceEpoch };
    const directory = await port.prepareAttachmentDirectory({ ...request, create: false });
    if (typeof directory?.exists !== 'boolean') throw new Error('Cannot verify the attachment backup folder.');
    if (!initialized || !directory.exists) {
      const inventory = await source.inventory();
      if (!inventory.files) throw new Error('Cannot read the attachment directory.');
      await source.write(db => seedFolderAttachmentBaseline(db, input.profile, inventory.files!.map(file => file.storageKey)));
    }
    // Keep a missing folder observable until the entire inventory can be retried from durable work.
    if (!directory.exists && !(await port.prepareAttachmentDirectory({ ...request, create: true })).exists) {
      throw new Error('Cannot create the attachment backup folder.');
    }
    const work = await source.write(db => readFolderAttachmentWork(db, input.profile));
    const copies = work.filter(entry => entry.action === 'copy');
    for (let start = 0; start < copies.length; start += COMPANION_FOLDER_ATTACHMENT_COPY_BATCH) {
      if (stopped()) break;
      const batch = await copyBatch(port, source, input, copies.slice(start, start + COMPANION_FOLDER_ATTACHMENT_COPY_BATCH));
      copied += batch.copied;
      errorMessage ??= batch.failed[0]?.error ?? null;
      if (!batch.complete) { if (!stopped()) errorMessage ??= cancelledMessage; break; }
    }
    for (const entry of work.filter(entry => entry.action === 'delete')) {
      if (stopped() || errorMessage === cancelledMessage) break;
      // A failed source deletion (or a later restore) can be discharged only by verifying the original and its copy.
      if (entry.stage === 'source') {
        const probe = await copyBatch(port, source, input, [entry], false);
        copied += probe.copied;
        if (probe.confirmed.length) continue;
      }
      // An absent original is deletable only with this request's committed snapshot permission.
      if (!input.deletions?.some(candidate => candidate.storage_key === entry.storage_key
        && candidate.token === entry.token && candidate.stage === entry.stage)) continue;
      try {
        await port.deleteAttachment({ requestId: input.requestId, sourceEpoch: input.sourceEpoch, storageKey: entry.storage_key });
        await source.write(db => confirmFolderAttachmentCopies(db, input.profile, [entry]));
      } catch (error) {
        errorMessage ??= message(error);
        await source.write(db => failFolderAttachmentCopies(db, input.profile, [{ work: entry, error: message(error) }]));
      }
    }
    pending = await source.write(db => countFolderAttachmentWork(db, input.profile));
  } catch (error) { errorMessage = message(error); }
  return port.finishAttachments({ requestId: input.requestId, copied, pending, errorMessage });
}

/** Copies one batch natively, then records its outcomes with one confirmation and one failure write.
 * A source-deletion probe only discharges on success; its expected failure is not a backup error. */
async function copyBatch(port: CompanionFolderBackupPort, source: Source, input: Input,
  entries: FolderAttachmentWork[], recordFailures = true) {
  let results: CompanionFolderAttachmentCopyResult[];
  // A stop lets native work finish its current file and leave the remaining keys unattempted.
  const stop = () => { void port.stopAttachments({ requestId: input.requestId }).catch(() => undefined); };
  input.stopped?.addEventListener('abort', stop, { once: true });
  try {
    results = (await port.copyAttachments({ requestId: input.requestId, sourceEpoch: input.sourceEpoch,
      storageKeys: entries.map(entry => entry.storage_key) })).results;
  } catch (error) { results = entries.map(entry => ({ storageKey: entry.storage_key, errorMessage: message(error) })); }
  finally { input.stopped?.removeEventListener('abort', stop); }
  let copied = 0;
  const confirmed: FolderAttachmentWork[] = [], failed: { work: FolderAttachmentWork; error: string }[] = [];
  for (const [index, entry] of entries.entries()) {
    const result = results[index];
    if (!result || result.storageKey !== entry.storage_key) break;
    if (result.errorMessage === undefined) { confirmed.push(entry); if (result.copied) copied += 1; }
    else failed.push({ work: entry, error: result.errorMessage });
  }
  const complete = confirmed.length + failed.length === entries.length;
  if (confirmed.length) {
    try { await source.write(db => confirmFolderAttachmentCopies(db, input.profile, confirmed)); }
    // The targets are verified; a failed acknowledgement leaves the work to be repeated safely.
    catch (error) { failed.unshift(...confirmed.splice(0).map(work => ({ work, error: message(error) }))); }
  }
  if (failed.length && recordFailures) await source.write(db => failFolderAttachmentCopies(db, input.profile, failed));
  return { confirmed, failed, copied, complete };
}
