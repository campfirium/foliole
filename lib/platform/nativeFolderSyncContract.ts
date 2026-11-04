export interface FolderSyncCompletion {
  sourceId: string;
  checkedAt: string;
  generation: number;
  pendingResources: number;
}

export interface FolderSyncLocation {
  token: string;
  name: string;
  authorized: boolean;
  completion: FolderSyncCompletion | null;
}

export type FolderSyncFileOperation = { key: string } & (
  | { operation: 'read' | 'stat' | 'length' | 'remove' | 'publish' }
  | { operation: 'write'; base64: string }
  | { operation: 'truncate'; length: number }
  | { operation: 'append'; offset: number; base64: string }
);

export interface FolderSyncNativePlugin {
  readLocation(): Promise<{ location: FolderSyncLocation | null }>;
  chooseLocation(): Promise<{ location: FolderSyncLocation | null; cancelled: boolean }>;
  acquire(input: { token: string }): Promise<{ lease: string }>;
  release(input: { token: string; lease: string }): Promise<void>;
  saveCompletion(input: { token: string; lease: string; completion: FolderSyncCompletion }): Promise<void>;
  access(input: { token: string; lease: string } & FolderSyncFileOperation): Promise<{
    base64?: string | null; present?: boolean; length?: number; hash?: string;
  }>;
}
