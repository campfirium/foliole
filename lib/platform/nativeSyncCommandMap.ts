import type { DesktopSyncDiagnosticsPayload } from './desktopSyncDiagnosticsContract.js';
import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { DesktopSyncGroupOverviewPayload } from './nativeCompanionSyncContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncPeer
} from './nativeSyncContract.js';
import type { SyncGroupDiscoverySnapshot } from './syncGroupDiscoveryContract.js';
import type { SyncGroupJoinMode } from './syncGroupJoinMode.js';
import type { SystemEntryDisplayNamesPayload } from './systemEntryDisplayNameContract.js';
import type { WebDavAttachmentPolicy } from './webDavRelayContract.js';

export type NativeSyncCommandMap = {
  [NATIVE_COMMANDS.loadDesktopSyncDiagnostics]: {
    args: undefined;
    result: DesktopSyncDiagnosticsPayload;
  };
  [NATIVE_COMMANDS.loadSystemEntryDisplayNames]: {
    args: undefined;
    result: SystemEntryDisplayNamesPayload;
  };
  [NATIVE_COMMANDS.saveSystemEntryDisplayNames]: {
    args: { payload: SystemEntryDisplayNamesPayload };
    result: SystemEntryDisplayNamesPayload;
  };
  [NATIVE_COMMANDS.loadSyncIndex]: {
    args: undefined;
    result: NativeSyncIndexEntry[];
  };
  [NATIVE_COMMANDS.loadSyncNodes]: {
    args: { objectIds: string[] };
    result: NativeSyncNodeRecord[];
  };
  [NATIVE_COMMANDS.loadSyncObjects]: {
    args: { objectIds: string[]; objectTypes?: string[] };
    result: NativeSyncObjectRecord[];
  };
  [NATIVE_COMMANDS.applySyncObjects]: {
    args: { objects: NativeSyncObjectRecord[] };
    result: string[];
  };
  [NATIVE_COMMANDS.loadSyncNodeConflicts]: {
    args: { objectIds?: string[] } | undefined;
    result: NativeSyncNodeConflictRecord[];
  };
  [NATIVE_COMMANDS.applySyncNodes]: {
    args: { nodes: NativeSyncNodeRecord[] };
    result: string[];
  };
  [NATIVE_COMMANDS.recordSyncNodeConflicts]: {
    args: { conflicts: NativeSyncNodeConflictRecord[] };
    result: string[];
  };
  [NATIVE_COMMANDS.loadSyncPeers]: {
    args: undefined;
    result: NativeSyncPeer[];
  };
  [NATIVE_COMMANDS.saveSyncPeers]: {
    args: { peers: NativeSyncPeer[] };
    result: NativeSyncPeer[];
  };
  [NATIVE_COMMANDS.openWebDavRelayLog]: { args: undefined; result: null | 'empty' };
  [NATIVE_COMMANDS.enableWebDavRelay]: {
    args: { group_id: string; device_id: string; authenticated?: true };
    result: void;
  };
  [NATIVE_COMMANDS.loadWebDavRelayDirectory]: {
    args: { group_id: string };
    result: { directory: string | null; credential_directory: string | null };
  };
  [NATIVE_COMMANDS.confirmWebDavCredentialDelivery]: {
    args: { group_id: string; id: string; fingerprint: string; username: string; password: string };
    result: null;
  };
  [NATIVE_COMMANDS.loadWebDavSetupDraft]: {
    args: { group_id: string };
    result: { address: string; folder: string; username: string; has_password: boolean } | null;
  };
  [NATIVE_COMMANDS.saveWebDavSetupDraft]: {
    args: { group_id: string; draft: { address: string; folder: string; username: string; password?: string } };
    result: boolean;
  };
  [NATIVE_COMMANDS.saveWebDavRelayDirectory]: {
    args: { group_id: string; directory_url: string; credentials?: { username: string; password: string }; new_folder_name?: string; use_setup_password?: true };
    result: string;
  };
  [NATIVE_COMMANDS.saveWebDavAttachmentPolicy]: {
    args: { group_id: string; policy: WebDavAttachmentPolicy };
    result: WebDavAttachmentPolicy;
  };
  [NATIVE_COMMANDS.loadSyncGroupOverview]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.saveWatchedFolderConflict]: {
    args: { selections: Array<{ conflict_key: string; selected_binding_ids: string[] }> };
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.createSyncGroup]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.leaveSyncGroup]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.overwriteExpiredSyncGroupMember]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.removeSyncGroupDevice]: {
    args: { device_identity_key: string };
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.discoverSyncGroups]: {
    args: undefined;
    result: SyncGroupDiscoverySnapshot;
  };
  [NATIVE_COMMANDS.recoverSyncGroupDiscovery]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.stopDiscoverSyncGroups]: {
    args: undefined;
    result: SyncGroupDiscoverySnapshot;
  };
  [NATIVE_COMMANDS.requestSyncGroupJoin]: {
    args: { endpoint_url: string; mode: SyncGroupJoinMode };
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.completeSyncGroupJoin]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.enableCompanionSync]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.disableCompanionSync]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.pauseCompanionSync]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.resumeCompanionSync]: {
    args: { confirmed_restore_id?: string } | undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.syncCompanionNow]: {
    args: undefined;
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.acceptSyncGroupJoinRequest]: {
    args: { request_id: string };
    result: DesktopSyncGroupOverviewPayload;
  };
  [NATIVE_COMMANDS.rejectSyncGroupJoinRequest]: {
    args: { request_id: string };
    result: DesktopSyncGroupOverviewPayload;
  };
};
