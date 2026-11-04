import { parseCanonicalAttachmentStorageKey } from '../../../../../lib/platform/attachmentResource';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

type Inventory = () => Promise<{ files?: Array<{ storageKey: string; sizeBytes: number }> }>;

/** Copy the actual attachment directory, including files without a current database reference. */
export async function copyCompanionFolderAttachments(port: CompanionFolderBackupPort,
  input: { sourceEpoch: string; requestId: string }, inventory: Inventory) {
  let copied = 0;
  let pending: number | null = null;
  let errorMessage: string | null = null;
  try {
    await port.prepareAttachmentDirectory(input);
    const result = await inventory();
    if (!result.files) throw new Error('Cannot read the attachment directory.');
    const keys = [...new Set(result.files.map(file => file.storageKey))];
    if (keys.some(key => !parseCanonicalAttachmentStorageKey(key))) throw new Error('Invalid attachment filename.');
    pending = keys.length;
    for (const storageKey of keys) {
      try {
        const result = await port.copyAttachment({ ...input, storageKey });
        if (result.copied) copied += 1;
        pending -= 1;
      } catch (error) {
        errorMessage ??= error instanceof Error ? error.message : String(error);
      }
    }
  } catch (error) { errorMessage = error instanceof Error ? error.message : String(error); }
  return port.finishAttachments({ requestId: input.requestId, copied, pending, errorMessage });
}
