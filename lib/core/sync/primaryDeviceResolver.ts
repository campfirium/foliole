export type PrimaryDeviceHostKind = 'companion' | 'desktop';
export type PrimaryDeviceRole = 'primary' | 'secondary' | 'unknown';
export type PrimaryDevicePeerStatus = 'paired' | 'revoked' | 'stale';
export type PrimaryDeviceSource =
  | 'committed-primary-device'
  | 'companion-paired-primary'
  | 'desktop-paired-default'
  | 'paired-primary-missing'
  | 'self-unpaired';
export type PrimaryDeviceTakeoverBlockedReason =
  | 'control-message-carrier-missing'
  | 'no-current-primary-device'
  | 'release-ack-missing'
  | 'sync-latest-confirmation-missing';

export interface PrimaryDevicePeer {
  deviceId: string;
  lastSeenVersionCursor?: string | null;
  lastSyncedAt?: string | null;
  status?: PrimaryDevicePeerStatus;
}

export interface PrimaryDeviceCommittedState {
  primaryDeviceId: string;
}

export interface ResolvePrimaryDeviceInput {
  committedState?: PrimaryDeviceCommittedState | null;
  hostKind: PrimaryDeviceHostKind;
  isPairedToPrimary?: boolean;
  localDeviceId: string;
  pairedPrimaryDeviceId?: string | null;
  syncPeers?: readonly PrimaryDevicePeer[];
  trustedPeers?: readonly PrimaryDevicePeer[];
}

export interface PrimaryDeviceState {
  canInitiateTakeover: boolean;
  localRole: PrimaryDeviceRole;
  primaryDeviceId: string | null;
  source: PrimaryDeviceSource;
  takeoverBlockedReasons: PrimaryDeviceTakeoverBlockedReason[];
}

export interface PrimaryDeviceAuthorityCoverage {
  answers: string;
  gap: string;
  source: string;
}

export const PRIMARY_DEVICE_AUTHORITY_COVERAGE: readonly PrimaryDeviceAuthorityCoverage[] = [
  coverage('sync_peers', 'peer status, last sync time, and per-peer cursor hints', 'does not name the active primary device'),
  coverage('pairing trust', 'which devices are trusted and have a device_secret', 'does not express role ownership'),
  coverage('sync_object_state.state_seq', 'local object ordering', 'is not comparable across devices'),
  coverage('sync_peer_cursors', 'whether a peer has reached a known cursor', 'does not commit a role change'),
  coverage('syncObjectPolicy', 'object authority scope and conflict policy', 'does not pick an external-source runner'),
  coverage('sync_push_ack', 'whether pushed device-private writes were accepted', 'is not a takeover release ack')
];

const TAKEOVER_PROTOCOL_GAPS: readonly PrimaryDeviceTakeoverBlockedReason[] = [
  'sync-latest-confirmation-missing',
  'control-message-carrier-missing',
  'release-ack-missing'
];

export function resolvePrimaryDeviceState(input: ResolvePrimaryDeviceInput): PrimaryDeviceState {
  const localDeviceId = requireDeviceId(input.localDeviceId, 'localDeviceId');
  const committedPrimaryDeviceId = normalizeDeviceId(input.committedState?.primaryDeviceId);
  if (committedPrimaryDeviceId) {
    return stateFromPrimaryDevice(committedPrimaryDeviceId, localDeviceId, 'committed-primary-device');
  }
  if (input.hostKind === 'desktop') {
    return {
      canInitiateTakeover: false,
      localRole: 'primary',
      primaryDeviceId: localDeviceId,
      source: hasActivePeer(input.trustedPeers) || hasActivePeer(input.syncPeers) ? 'desktop-paired-default' : 'self-unpaired',
      takeoverBlockedReasons: []
    };
  }
  return resolveCompanionPrimaryDevice(input, localDeviceId);
}

export function canRunPrimaryDeviceExternalSource(state: Pick<PrimaryDeviceState, 'localRole'>) {
  return state.localRole === 'primary';
}

function resolveCompanionPrimaryDevice(input: ResolvePrimaryDeviceInput, localDeviceId: string): PrimaryDeviceState {
  const pairedPrimaryDeviceId = normalizeDeviceId(input.pairedPrimaryDeviceId) ?? firstActiveRemotePeerId(input, localDeviceId);
  if (pairedPrimaryDeviceId) {
    return stateFromPrimaryDevice(pairedPrimaryDeviceId, localDeviceId, 'companion-paired-primary');
  }
  if (input.isPairedToPrimary) {
    return {
      canInitiateTakeover: false,
      localRole: 'secondary',
      primaryDeviceId: null,
      source: 'paired-primary-missing',
      takeoverBlockedReasons: ['no-current-primary-device', ...TAKEOVER_PROTOCOL_GAPS]
    };
  }
  return {
    canInitiateTakeover: false,
    localRole: 'primary',
    primaryDeviceId: localDeviceId,
    source: 'self-unpaired',
    takeoverBlockedReasons: []
  };
}

function stateFromPrimaryDevice(
  primaryDeviceId: string,
  localDeviceId: string,
  source: PrimaryDeviceSource
): PrimaryDeviceState {
  const isLocalPrimary = primaryDeviceId === localDeviceId;
  return {
    canInitiateTakeover: false,
    localRole: isLocalPrimary ? 'primary' : 'secondary',
    primaryDeviceId,
    source,
    takeoverBlockedReasons: isLocalPrimary ? [] : [...TAKEOVER_PROTOCOL_GAPS]
  };
}

function firstActiveRemotePeerId(input: ResolvePrimaryDeviceInput, localDeviceId: string) {
  const peers = [...(input.trustedPeers ?? []), ...(input.syncPeers ?? [])];
  for (const peer of peers) {
    const deviceId = normalizeDeviceId(peer.deviceId);
    if (deviceId && deviceId !== localDeviceId && isActivePeer(peer)) {
      return deviceId;
    }
  }
  return null;
}

function hasActivePeer(peers: readonly PrimaryDevicePeer[] | undefined) {
  return peers?.some(isActivePeer) ?? false;
}

function isActivePeer(peer: PrimaryDevicePeer) {
  return (peer.status ?? 'paired') === 'paired' && Boolean(normalizeDeviceId(peer.deviceId));
}

function requireDeviceId(value: string, field: string) {
  const deviceId = normalizeDeviceId(value);
  if (!deviceId) {
    throw new Error(`${field} is required to resolve primary device state.`);
  }
  return deviceId;
}

function normalizeDeviceId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function coverage(source: string, answers: string, gap: string): PrimaryDeviceAuthorityCoverage {
  return { answers, gap, source };
}
