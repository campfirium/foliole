// Dev-only stand-ins for the companion's own native plugins in the browser preview. Local host
// facts get preview values; sync, pairing, network and file transfer are left out, so Capacitor
// rejects those calls instead of pretending they succeeded.

export function createCompanionPreviewSyncPlugin(hostName: string) {
  return {
    async loadSyncGroupDeviceIdentity(args: unknown) {
      return {
        canonical_library_path: (args as { database_path: string }).database_path,
        device_anchor: 'web-preview-device',
        device_name: hostName,
        path_flavor: 'posix' as const
      };
    },
    // The owner lifecycle opens and closes a payload budget even when no sync ever runs.
    async configureFramedSyncPayloadBudget() {},
    async closeFramedSyncPayloadBudget() {},
    async accessFramedSyncFile(args: unknown) {
      const { operation } = args as { operation: string };
      if (operation === 'remove') return {};
      throw new Error(`Sync file ${operation} is unavailable in the companion preview.`);
    },
    async maintainAttachmentFiles(args: unknown) {
      const { operation } = args as { operation: string };
      if (operation === 'inventory') return { files: [] };
      throw new Error(`Attachment ${operation} is unavailable in the companion preview.`);
    }
  };
}

// A browser has no system share sheet, so the preview inbox is always empty.
export function createCompanionPreviewShareInboxPlugin() {
  return {
    async acknowledgeShare() {},
    async addListener() {},
    async removeListener() {},
    async loadPendingShares() {
      return { items: [] };
    }
  };
}
