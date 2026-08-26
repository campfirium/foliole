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
import type { SystemEntryDisplayNamesPayload } from './systemEntryDisplayNameContract.js';

export type NativeSyncCommandMap = {
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
  [NATIVE_COMMANDS.loadSyncGroupOverview]: {
    args: undefined;
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
  [NATIVE_COMMANDS.discoverSyncGroups]: {
    args: undefined;
    result: SyncGroupDiscoverySnapshot;
  };
  [NATIVE_COMMANDS.stopDiscoverSyncGroups]: {
    args: undefined;
    result: SyncGroupDiscoverySnapshot;
  };
  [NATIVE_COMMANDS.requestSyncGroupJoin]: {
    args: { endpoint_url: string };
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
    args: undefined;
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
