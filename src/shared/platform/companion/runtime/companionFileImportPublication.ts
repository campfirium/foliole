import { recordFramedSyncResourceAvailability } from '../../../../../lib/core/database/framedSyncResourceAvailability';
import { ATTACHMENT_BLOCK_BYTES } from '../../../../../lib/core/sync/attachmentBlockReceiver';
import { createAttachmentReceiveSession } from '../../../../../lib/core/sync/attachmentReceiveSession';
import { createCompanionAttachmentFiles } from '../sync/framed/companionAttachmentFiles';
import { currentCompanionRequestSyncDatabaseHost } from '../sync/framed/companionRequestSyncDatabaseHost';

import { companionFramedFileOwner } from './companionFramedPayloadBudget';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

/** Reuse the library's verified attachment receiver, retaining its lease through the database commit. */
export async function publishCompanionImportedFile<T>(source: { bytes: Uint8Array; storageKey: string },
  commit: () => Promise<T>, owner: ReturnType<typeof getIosCompanionDatabaseOwner>, signal?: AbortSignal): Promise<T> {
  const db = await currentCompanionRequestSyncDatabaseHost();
  if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
  const files = createCompanionAttachmentFiles(companionFramedFileOwner(owner),
    (hash, available) => db.write(port => recordFramedSyncResourceAvailability(port, [hash], available)));
  const committed: { result?: T } = {};
  const session = createAttachmentReceiveSession(files, { shouldYield: () => false, ...(signal ? { signal } : {}) },
    async () => {
      committed.result = await commit();
    }, () => {});
  const resource = { storageKey: source.storageKey, byteLength: source.bytes.length };
  const hash = source.storageKey.slice(0, 64);
  try {
    let offset = 0;
    while (offset < source.bytes.length) {
      signal?.throwIfAborted();
      const start = offset;
      const result = await session.receiveWindow(resource, start, async () => {
        if (!start) await files.truncate(hash, 0);
        let blocks = 0;
        for (; blocks < 64 && offset < source.bytes.length; blocks++) {
          signal?.throwIfAborted();
          const bytes = source.bytes.subarray(offset, offset + ATTACHMENT_BLOCK_BYTES);
          await files.append(hash, offset, bytes);
          offset += bytes.length;
        }
        return { offset, blocks, pending: false };
      });
      offset = result.offset;
    }
    await session.settled(source.storageKey);
    if (!('result' in committed)) throw new Error('File import was not committed.');
    return committed.result as T;
  } finally { await session.close(); }
}

/** Acquire resources in canonical order, keeping each lease until the entire book commits. */
export async function publishCompanionImportedFiles<T>(sources: { bytes: Uint8Array; storageKey: string }[],
  commit: () => Promise<T>, owner: ReturnType<typeof getIosCompanionDatabaseOwner>, signal?: AbortSignal): Promise<T> {
  const ordered = [...new Map(sources.map(source => [source.storageKey, source])).values()]
    .sort((left, right) => left.storageKey.localeCompare(right.storageKey));
  const publish = (index: number): Promise<T> => index === ordered.length ? commit()
    : publishCompanionImportedFile(ordered[index]!, () => publish(index + 1), owner, signal);
  return publish(0);
}
