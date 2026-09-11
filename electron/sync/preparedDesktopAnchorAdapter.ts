import {
  projectPreparedTopologySyncStatus
} from '../../lib/platform/syncAnchorRouteSelector.js';
import {
  parseDesktopAnchorRole,
  parsePreparedAnchorAdvertisementProtocol,
  qualifyPreparedAnchorEvidence,
  serializePreparedAnchorTxt,
  type DesktopAnchorRole,
  type PreparedAnchorEvidence
} from '../../lib/platform/syncAnchorTopologyContract.js';

export const projectPreparedDesktopTopologyStatus = projectPreparedTopologySyncStatus;

export function createPreparedDesktopAnchorTxt(args: {
  device_id: string;
  group_id: string;
  group_tag: string;
  role: DesktopAnchorRole;
}) {
  return { ...serializePreparedAnchorTxt(args.role), device_id: args.device_id,
    group_id: args.group_id, group_tag: args.group_tag, provider_platform: 'desktop' };
}

export function qualifyPreparedDesktopAnchorCandidate(args: {
  endpoint_url: string;
  http: Record<string, unknown>;
  txt: Record<string, unknown>;
}) {
  const advertised = evidence(args.endpoint_url, args.txt, 'device_id');
  const discovered = evidence(args.endpoint_url, args.http, 'provider_device_id');
  return qualifyPreparedAnchorEvidence(advertised, discovered);
}

function evidence(
  endpointUrl: string,
  value: Record<string, unknown>,
  deviceKey: 'device_id' | 'provider_device_id'
): PreparedAnchorEvidence {
  const platform = String(value.provider_platform ?? '');
  return {
    endpoint_url: endpointUrl,
    group_id: String(value.group_id ?? ''),
    group_tag: String(value.group_tag ?? ''),
    provider_device_id: String(value[deviceKey] ?? ''),
    provider_kind: isDesktop(platform) ? 'desktop' : 'mobile',
    protocol: value.protocol && typeof value.protocol === 'object'
      ? value.protocol as PreparedAnchorEvidence['protocol']
      : parsePreparedAnchorAdvertisementProtocol(value) ?? invalidProtocol(),
    role: parseDesktopAnchorRole(value.topology_role)
  };
}

function invalidProtocol(): PreparedAnchorEvidence['protocol'] {
  return { capabilities: [], max_supported_version: 1, min_supported_version: 1, version: 1 };
}

function isDesktop(platform: string) {
  return ['desktop', 'darwin', 'macos', 'win32', 'windows'].includes(platform.toLowerCase());
}
