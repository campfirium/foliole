import {
  SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN,
  SYNC_GROUP_ROUTE_HMAC_VERSION
} from '../../platform/syncGroupAuthorizationContract.js';

const AUTHORIZATION_METHODS = [
  'loadSyncGroupMemberRoute',
  'migrateLegacyPairingToMemberRoute',
  'revokeSyncGroupMemberRoute',
  'signSyncGroupMemberRequest'
] as const;

const ANDROID_PROVIDER_METHODS = [
  'approveSyncGroupJoinRequest', 'bindSyncGroupPeerRoute', 'clearPairingCredentials',
  'clearSyncGroupCredentials', 'desktopHttpRequest', 'downloadAttachmentResourceBatch',
  'downloadContentBlobBatch', 'finishAttachmentResourceBatch', 'finishContentBlobBatch',
  'loadDiscoveryCandidates', 'loadPairingState', 'loadSyncGroupProviderState',
  'loadSyncParticipationState', 'rejectSyncGroupJoinRequest', 'resolveAttachmentResource',
  'resolveSyncGroupDataRequest', 'savePairingCredentials', 'setSyncEnabled', 'setSyncPaused',
  'signCompanionSyncRequest', 'stageAttachmentResourceBatch', 'startSyncGroupProvider',
  'stopSyncGroupProvider'
] as const;

const IOS_MEMBER_CLIENT_METHODS = [
  'clearPairingCredentials', 'desktopHttpRequest', 'downloadAttachmentResourceBatch',
  'downloadContentBlobBatch', 'finishAttachmentResourceBatch', 'finishContentBlobBatch',
  'loadDiscoveryCandidates', 'loadPairingState', 'loadSyncParticipationState',
  'resolveAttachmentResource', 'savePairingCredentials', 'setSyncEnabled', 'setSyncPaused',
  'signCompanionSyncRequest', 'stageAttachmentResourceBatch'
] as const;

const AUTHORIZATION_CONTRACT = {
  canonical: {
    algorithm: 'HMAC-SHA256',
    fields: ['version', 'method', 'path_with_query', 'timestamp', 'nonce', 'body_hash',
      'group_id', 'local_member_id', 'peer_member_id', 'authorization_epoch', 'route_id'],
    version: SYNC_GROUP_ROUTE_HMAC_VERSION
  },
  headerKeys: {
    authorizationEpoch: 'X-Authorization-Epoch', authorizationId: 'X-Authorization-Id',
    groupId: 'X-Sync-Group-Id', localMemberId: 'X-Local-Member-Id', nonce: 'X-Nonce',
    peerMemberId: 'X-Peer-Member-Id', routeId: 'X-Route-Id', signature: 'X-Signature',
    timestamp: 'X-Timestamp'
  },
  prepare: { registrationState: 'inactive', token: SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN },
  requestKeys: {
    authorizationEpoch: 'authorization_epoch', authorizationId: 'authorization_id',
    bodyHash: 'body_hash', endpointHint: 'endpoint_hint', groupId: 'group_id',
    localMemberId: 'local_member_id', method: 'method', nonce: 'nonce',
    pathWithQuery: 'path_with_query', peerMemberId: 'peer_member_id',
    prepareToken: 'prepare_token', protocolVersion: 'protocol_version', routeId: 'route_id',
    timestamp: 'timestamp'
  },
  stateKeys: {
    authorizationEpoch: 'authorization_epoch', authorizationId: 'authorization_id',
    endpointHint: 'endpoint_hint', groupId: 'group_id', kind: 'kind',
    localMemberId: 'local_member_id', peerMemberId: 'peer_member_id',
    protocolVersion: 'protocol_version', routeId: 'route_id', state: 'state'
  },
  storage: {
    memberKeyAlias: 'foliole_sync_group_member_route_v1',
    memberPreferencesName: 'foliole_sync_group_member_routes_v1',
    verificationKeyAlias: 'foliole_sync_group_verification_route_v1',
    verificationPreferencesName: 'foliole_sync_group_verification_routes_v1'
  }
} as const;

function inventory(methods: readonly string[]) {
  return [...methods, ...AUTHORIZATION_METHODS].sort();
}

export const ANDROID_COMPANION_SYNC_GROUP_BRIDGE_CONTRACT_DEFINITIONS = {
  authorization: AUTHORIZATION_CONTRACT,
  methodInventory: { folioleCompanionSync: inventory(ANDROID_PROVIDER_METHODS) },
  productionBridgeAsset: 'companion-bridge-contract-definitions.json'
} as const;

export const IOS_COMPANION_SYNC_GROUP_BRIDGE_CONTRACT_DEFINITIONS = {
  authorization: AUTHORIZATION_CONTRACT,
  methodInventory: { folioleCompanionSync: inventory(IOS_MEMBER_CLIENT_METHODS) },
  productionBridgeAsset: 'companion-bridge-contract-definitions.json'
} as const;
