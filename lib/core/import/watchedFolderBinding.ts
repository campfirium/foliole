import type {
  ImportHighlightMode,
  ImportManagerSourceDraft
} from './importManagerSettings.js';

export type WatchedFolderClaimState = 'unassigned' | 'proposed' | 'claimed' | 'conflict';

export interface WatchedFolderBinding {
  actionMode: ImportManagerSourceDraft['actionMode'];
  archivePath: string;
  availability: string;
  bindingId: string;
  claimRevision: string | null;
  claimState: WatchedFolderClaimState;
  enabled: boolean;
  highlightMode: ImportHighlightMode;
  highlightPath: string;
  keepPreview: ImportManagerSourceDraft['keepPreview'];
  ownerDeviceName: string | null;
  ownerInstallationId: string | null;
  ownerPlatform: string | null;
  primaryPath: string;
  updatedAt: string;
}

export function watchedBindingToSource(
  binding: WatchedFolderBinding,
  localInstallationId?: string
): ImportManagerSourceDraft {
  return {
    actionMode: binding.actionMode,
    archivePath: binding.archivePath,
    highlightMode: binding.highlightMode,
    highlightPath: binding.highlightPath,
    id: binding.bindingId,
    keepPreview: binding.keepPreview,
    keepState: binding.enabled ? 'enabled' : 'draft',
    primaryPath: binding.primaryPath,
    ownership: {
      claimState: binding.claimState,
      editable: binding.ownerInstallationId === localInstallationId && binding.claimState !== 'conflict',
      ownerDeviceName: binding.ownerDeviceName,
      ownerInstallationId: binding.ownerInstallationId,
      ownerPlatform: binding.ownerPlatform
    }
  };
}
