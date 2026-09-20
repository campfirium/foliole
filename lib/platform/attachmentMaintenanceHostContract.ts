import type { AttachmentFileEntry } from './attachmentMaintenanceContract.js';

export interface AttachmentMaintenanceHostPlugin {
  maintainAttachmentFiles(args: {
    operation: 'inventory' | 'read-state' | 'write-state' | 'move' | 'remove-trash' | 'generation';
    trash?: boolean;
    storageKey?: string;
    state?: string;
    databasePath?: string;
  }): Promise<{ files?: AttachmentFileEntry[]; state?: string | null; generation?: string }>;
}
