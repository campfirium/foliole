import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { DesktopCompanionPairingOverviewPayload } from './nativeCompanionSyncContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncPeer
} from './nativeSyncContract.js';

export type NativeSyncCommandMap = {
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
  [NATIVE_COMMANDS.loadCompanionPairingOverview]: {
    args: undefined;
    result: DesktopCompanionPairingOverviewPayload;
  };
  [NATIVE_COMMANDS.enableCompanionSync]: {
    args: undefined;
    result: DesktopCompanionPairingOverviewPayload;
  };
  [NATIVE_COMMANDS.disableCompanionSync]: {
    args: undefined;
    result: DesktopCompanionPairingOverviewPayload;
  };
  [NATIVE_COMMANDS.clearCompanionPairedDevices]: {
    args: undefined;
    result: DesktopCompanionPairingOverviewPayload;
  };
  [NATIVE_COMMANDS.approveCompanionPairRequest]: {
    args: { pair_request_id: string };
    result: DesktopCompanionPairingOverviewPayload;
  };
  [NATIVE_COMMANDS.rejectCompanionPairRequest]: {
    args: { pair_request_id: string };
    result: DesktopCompanionPairingOverviewPayload;
  };
};
