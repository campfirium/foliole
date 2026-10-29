import { readAttachmentReferenceInputs, readCompleteAttachmentReferenceKeys,
  saveAttachmentReferenceResults } from '../../../../../lib/core/attachments/attachmentReferenceCache';
import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { createCompanionAttachmentParser } from './companionAttachmentParser';

export async function readCompanionObservationReferences(owner: CapacitorCompanionDatabaseOwner,
  generation: () => Promise<string>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const path = owner.databasePath;
  const originalGeneration = await generation();
  let parser: ReturnType<typeof createCompanionAttachmentParser> | undefined;
  let after: string | null = null;
  const assertSource = async () => {
    signal?.throwIfAborted();
    if (owner.databasePath !== path || await generation() !== originalGeneration) {
      throw new Error('attachment_scan_database_replaced');
    }
  };
  try {
    for (;;) {
      // Release the readonly transaction before dispatching parsing or acquiring the writer.
      const rows = await owner.readBackgroundSnapshot(db => readAttachmentReferenceInputs(db, after, 16), signal);
      if (!rows.length) break;
      parser ??= createCompanionAttachmentParser(signal);
      const results = await parser.parse(rows);
      await owner.runWriter(async db => {
        await assertSource();
        await saveAttachmentReferenceResults(db, results);
      });
      after = rows.at(-1)!.id;
    }
    return await owner.runWriter(db => db.transaction(async tx => {
      await assertSource();
      const storageKeys = await readCompleteAttachmentReferenceKeys(tx);
      return storageKeys === null ? null : { storageKeys, revision: await attachmentDatabaseRevision(tx) };
    }));
  } finally { parser?.close(); }
}
