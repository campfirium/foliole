import { projectPreparedTopologySyncStatus } from '../../../../lib/platform/syncAnchorRouteSelector';
import {
  parseDesktopAnchorRole,
  parsePreparedAnchorAdvertisementProtocol,
  qualifyPreparedAnchorEvidence,
  type PreparedAnchorEvidence
} from '../../../../lib/platform/syncAnchorTopologyContract';

export const projectPreparedCompanionTopologyStatus = projectPreparedTopologySyncStatus;

export function qualifyPreparedCompanionAnchorCandidate(args: {
  endpoint_url: string;
  http: Record<string, unknown>;
  protocol_txt: Record<string, string>;
}) {
  const txt = args.protocol_txt;
  const http = args.http;
  const advertised: PreparedAnchorEvidence = {
    endpoint_url: args.endpoint_url,
    group_id: txt.group_id ?? '',
    group_tag: txt.group_tag ?? '',
    provider_device_id: txt.device_id ?? '',
    provider_kind: providerKind(txt.provider_platform ?? ''),
    protocol: parsePreparedAnchorAdvertisementProtocol(txt) ?? invalidProtocol(),
    role: parseDesktopAnchorRole(txt.topology_role)
  };
  const discovered: PreparedAnchorEvidence = {
    endpoint_url: args.endpoint_url,
    group_id: String(http.group_id ?? ''),
    group_tag: String(http.group_tag ?? ''),
    provider_device_id: String(http.provider_device_id ?? ''),
    provider_kind: providerKind(String(http.provider_platform ?? '')),
    protocol: http.protocol as PreparedAnchorEvidence['protocol'],
    role: parseDesktopAnchorRole(http.topology_role)
  };
  return qualifyPreparedAnchorEvidence(advertised, discovered);
}

function invalidProtocol(): PreparedAnchorEvidence['protocol'] {
  return { capabilities: [], max_supported_version: 1, min_supported_version: 1, version: 1 };
}

function providerKind(platform: string) {
  return ['android-capacitor', 'ios-capacitor'].includes(platform) ? 'mobile' as const : 'desktop' as const;
}
