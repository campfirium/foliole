import type { AttachmentStatusRequest } from '../../lib/platform/attachmentMaintenanceContract';
import type { CompanionSettingsPreview, CompanionSettingsPreviewSnapshot } from '../../src/shared/platform/companionSettingsPreview';

/** Dev-only UI fixture. Every action changes memory, never the copied library or phone files. */
export function createCompanionSettingsPreview(): CompanionSettingsPreview {
  const listeners = new Set<() => void>();
  const mb = 1024 * 1024;
  let state: CompanionSettingsPreviewSnapshot = {
    automaticBackup: true,
    backup: { configured: true, directoryLabel: 'Documents / Foliole Backups', directoryId: 'preview',
      databaseSavedAt: null, phase: 'pending', errorMessage: null, pendingItems: 3 },
    attachments: { automatic: true, observationThreshold: 30, usedBytes: Math.round(16.2 * mb),
      eligibleBytes: Math.round(12.4 * mb), trashBytes: 0, trash: [], lastObservationDay: null }
  };
  const emit = () => { for (const listener of listeners) listener(); };
  const updateBackup = (patch: Partial<CompanionSettingsPreviewSnapshot['backup']>) => {
    state = { ...state, backup: { ...state.backup, ...patch } }; emit(); return state.backup;
  };
  return {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async backUp(chooseDirectory) {
      // The preview cannot choose a real native folder. Changing location preserves the example.
      if (chooseDirectory && state.backup.configured) return state.backup;
      updateBackup({ configured: true, directoryLabel: 'Documents / Foliole Backups', phase: 'working' });
      await new Promise(resolve => setTimeout(resolve, 400));
      return updateBackup({ phase: 'saved', pendingItems: 0, errorMessage: null });
    },
    async setAutomaticBackup(enabled) { state = { ...state, automaticBackup: enabled }; emit(); },
    async forgetBackupDirectory() {
      state = { ...state, automaticBackup: false };
      return updateBackup({ configured: false, directoryLabel: null, phase: 'idle', pendingItems: null });
    },
    async maintainAttachments(request: AttachmentStatusRequest) {
      let attachments = { ...state.attachments };
      if (request.action === 'configure') attachments = { ...attachments, ...request.settings };
      if (request.action === 'clean' && attachments.eligibleBytes) attachments = { ...attachments,
        trashBytes: attachments.trashBytes + attachments.eligibleBytes, eligibleBytes: 0,
        trash: [{ storageKey: 'preview-attachment', sizeBytes: attachments.eligibleBytes }] };
      if (request.action === 'restore') attachments = { ...attachments,
        eligibleBytes: attachments.eligibleBytes + attachments.trashBytes, trashBytes: 0, trash: [] };
      if (request.action === 'empty-trash') attachments = { ...attachments,
        usedBytes: attachments.usedBytes - attachments.trashBytes, trashBytes: 0, trash: [] };
      state = { ...state, attachments }; emit(); return attachments;
    }
  };
}
