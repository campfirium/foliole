import type { AttachmentMaintenanceStatus, AttachmentStatusRequest } from '../../../../../lib/platform/attachmentMaintenanceContract';
import type { CompanionFolderBackupState } from '../../../../../lib/platform/companionFolderBackupContract';
import { getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';

export interface CompanionSettingsPreviewSnapshot {
  backup: CompanionFolderBackupState;
  automaticBackup: boolean;
  attachments: AttachmentMaintenanceStatus;
}

/** Optional presentation fixture supplied exclusively by the browser preview host. */
export interface CompanionSettingsPreview {
  snapshot(): CompanionSettingsPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  backUp(chooseDirectory: boolean): Promise<CompanionFolderBackupState>;
  setAutomaticBackup(enabled: boolean): Promise<void>;
  forgetBackupDirectory(): Promise<CompanionFolderBackupState>;
  maintainAttachments(request: AttachmentStatusRequest): Promise<AttachmentMaintenanceStatus>;
}

declare global {
  interface Window { __folioleSettingsPreview?: CompanionSettingsPreview }
}

export function getCompanionSettingsPreview() {
  return getCompanionRuntimeCapability().kind === 'browser-preview' ? window.__folioleSettingsPreview ?? null : null;
}
