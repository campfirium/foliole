import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';

export type NativeCompanionFramedFileRequest = NativeCompanionFramedPayloadBudgetOwner & {
  key: string;
} & ({ operation: 'read' | 'remove' | 'list' } | { operation: 'write'; base64: string });

/** Keys are relative to the native-owned sync directory of the current library. */
export interface NativeCompanionFramedFilesPlugin {
  accessFramedSyncFile(request: NativeCompanionFramedFileRequest): Promise<{
    base64?: string | null;
    entries?: string[];
  }>;
}
