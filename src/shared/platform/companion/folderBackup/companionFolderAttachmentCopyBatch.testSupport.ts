import type { CompanionFolderAttachmentCopyResult } from '../../../../../lib/platform/companionFolderBackupContract';

type CopyOne = (input: { sourceEpoch: string; requestId: string; storageKey: string }) => Promise<{ copied: boolean }>;

/** Test ports keep a per-file fake; this adapts it to the native batch contract: per-key outcomes in order,
 * and a stop request lets the current file finish before the remaining keys are left unattempted. */
export function folderAttachmentCopyPort(copy: CopyOne) {
  const stops = new Set<string>();
  return {
    async copyAttachments({ storageKeys, ...input }: { sourceEpoch: string; requestId: string; storageKeys: string[] }) {
      stops.delete(input.requestId);
      const results: CompanionFolderAttachmentCopyResult[] = [];
      for (const storageKey of storageKeys) {
        if (stops.has(input.requestId)) break;
        try { results.push({ storageKey, copied: (await copy({ ...input, storageKey })).copied }); }
        catch (error) { results.push({ storageKey, errorMessage: error instanceof Error ? error.message : String(error) }); }
      }
      return { results };
    },
    async stopAttachments({ requestId }: { requestId: string }) { stops.add(requestId); }
  };
}
