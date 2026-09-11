import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  DESKTOP_SOFT_ANCHOR_CAPABILITY,
  evaluateSyncProtocolVersionHint,
  parseSyncProtocolTxt,
  serializeSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor,
  type SyncProtocolDescriptor
} from './syncProtocolContract.js';

export const PREPARED_ANCHOR_TOPOLOGY_CAPABILITY = DESKTOP_SOFT_ANCHOR_CAPABILITY;
export const SYNC_ANCHOR_ROLE_TXT_KEY = 'topology_role';

export const PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR = Object.freeze({
  capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities,
  max_supported_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.max_supported_version,
  min_supported_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.min_supported_version,
  version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
} as const satisfies SyncProtocolDescriptor);

export type DesktopAnchorRole = 'observing' | 'member' | 'anchor';
export type PreparedProviderKind = 'desktop' | 'mobile';

export interface PreparedAnchorEvidence {
  endpoint_url: string;
  group_id: string;
  group_tag: string;
  provider_device_id: string;
  provider_kind: PreparedProviderKind;
  protocol: SyncProtocolDescriptor;
  role: DesktopAnchorRole | null;
}

export type PreparedAnchorQualification = {
  eligible: boolean;
  reason: 'eligible' | 'endpoint_mismatch' | 'identity_mismatch' | 'not_anchor' |
    'provider_not_desktop' | 'protocol_incompatible' | 'role_mismatch';
};

export function serializePreparedAnchorTxt(role: DesktopAnchorRole) {
  return {
    ...serializeSyncProtocolTxt(PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR),
    [SYNC_ANCHOR_ROLE_TXT_KEY]: role
  };
}

export function parseDesktopAnchorRole(value: unknown): DesktopAnchorRole | null {
  return value === 'observing' || value === 'member' || value === 'anchor' ? value : null;
}

export function parsePreparedAnchorAdvertisementProtocol(value: unknown): SyncProtocolDescriptor | null {
  const hint = parseSyncProtocolTxt(value);
  if (!hint) return null;
  return { ...hint, capabilities: PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR.capabilities };
}

export function qualifyPreparedAnchorEvidence(
  advertised: PreparedAnchorEvidence,
  discovered: PreparedAnchorEvidence
): PreparedAnchorQualification {
  if (advertised.provider_kind !== 'desktop' || discovered.provider_kind !== 'desktop') {
    return rejected('provider_not_desktop');
  }
  if (advertised.role !== discovered.role) return rejected('role_mismatch');
  if (advertised.role !== 'anchor') return rejected('not_anchor');
  if (normalizeEndpoint(advertised.endpoint_url) !== normalizeEndpoint(discovered.endpoint_url)) {
    return rejected('endpoint_mismatch');
  }
  if (advertised.group_id !== discovered.group_id || advertised.group_tag !== discovered.group_tag ||
      advertised.provider_device_id !== discovered.provider_device_id) {
    return rejected('identity_mismatch');
  }
  const versionHint = parseSyncProtocolTxt(serializeSyncProtocolTxt(advertised.protocol));
  const compatibility = evaluateSyncProtocolVersionHint(
    versionHint,
    PREPARED_ANCHOR_SYNC_PROTOCOL_DESCRIPTOR
  );
  if (compatibility.status !== 'compatible' ||
      !syncProtocolVersionHintMatchesDescriptor(versionHint, discovered.protocol) ||
      !discovered.protocol.capabilities.includes(PREPARED_ANCHOR_TOPOLOGY_CAPABILITY)) {
    return rejected('protocol_incompatible');
  }
  return { eligible: true, reason: 'eligible' };
}

export interface PreparedAnchorNetwork {
  probe(endpointUrl: string, signal: AbortSignal): Promise<PreparedAnchorEvidence>;
}

export async function probePreparedAnchorEndpoint(
  advertised: PreparedAnchorEvidence,
  network: PreparedAnchorNetwork,
  signal: AbortSignal
) {
  const discovered = await network.probe(advertised.endpoint_url, signal);
  return {
    discovered,
    qualification: qualifyPreparedAnchorEvidence(advertised, discovered)
  };
}

function rejected(reason: Exclude<PreparedAnchorQualification['reason'], 'eligible'>) {
  return { eligible: false, reason } as const;
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/\/+$/u, '').toLowerCase();
}
