import type { SyncProtocolCompatibilityResult } from '../../lib/platform/syncProtocolContract';

export interface CompanionSyncGroupDiscovery {
  appVersion: string;
  compatibility: SyncProtocolCompatibilityResult;
  endpointUrl: string;
  groupDisplayName: string;
  groupId: string;
  groupTag: string;
  providerDeviceId: string;
  providerDeviceName: string;
  providerPlatform: string;
}

export interface PendingSyncGroupJoinRequest {
  endpointUrl: string;
  expiresAt: string;
  groupId: string;
  providerDeviceId: string;
  providerDeviceName: string;
  providerPlatform: string;
  requestId: string;
}
