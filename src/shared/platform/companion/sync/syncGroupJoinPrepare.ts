import { registerPlugin } from '@capacitor/core';

import type {
  SyncGroupJoinAcceptance,
  SyncGroupJoinRequestInput
} from '../../../../../lib/platform/syncGroupJoinContract.js';

export interface SyncGroupJoinPrepareRequestPayload {
  device_name: string;
  expires_at: string;
  platform: string;
  request_id: string;
  requested_at: string;
  status: 'accepted' | 'pending';
}

interface SyncGroupJoinPreparePlugin {
  acceptRequest(options: { request_id: string }): Promise<SyncGroupJoinAcceptance>;
  collectAcceptance(options: { request_id: string }): Promise<SyncGroupJoinAcceptance | undefined>;
  loadRequests(): Promise<{ requests: SyncGroupJoinPrepareRequestPayload[] }>;
  receiveRequest(options: { request: SyncGroupJoinRequestInput }): Promise<SyncGroupJoinPrepareRequestPayload>;
  rejectRequest(options: { request_id: string }): Promise<{ rejected: boolean }>;
}

export const FolioleSyncGroupJoinPrepare = registerPlugin<SyncGroupJoinPreparePlugin>(
  'FolioleSyncGroupJoinPrepare'
);
