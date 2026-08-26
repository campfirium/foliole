import type { SyncGroupDiscoverySnapshot } from '../../../../lib/platform/syncGroupDiscoveryContract';
import { loadCompanionDiscoveryCandidates } from '../companionWorkspaceDiscovery';
import { FolioleCompanionSync, isNativeCompanionPairingRuntime } from '../companionWorkspaceRuntimeRepository';
import type { CompanionNativeDiscoveryEvent } from '../companionWorkspaceSyncPluginTypes';

export async function startCompanionSyncGroupDiscoverySession(
  onSnapshot: (snapshot: SyncGroupDiscoverySnapshot) => void
) {
  if (!isNativeCompanionPairingRuntime()) {
    onSnapshot({ candidates: [], change: 'failed', error_code: 'bridge_incompatible', status: 'incompatible' });
    return async () => undefined;
  }
  let active = true;
  const publish = async (event: CompanionNativeDiscoveryEvent) => {
    if (!active) return;
    if (event.status !== 'results') {
      onSnapshot({ candidates: [], change: event.change, error_code: event.error_code, status: event.status });
      return;
    }
    const candidates = await loadCompanionDiscoveryCandidates(event.candidates.map((candidate) => ({
      endpointUrl: candidate.endpoint_url,
      protocolTxt: candidate.protocol_txt ?? null,
      source: candidate.source
    })));
    if (!active) return;
    const compatible = candidates.filter((candidate) => candidate.compatibility.status === 'compatible');
    const status = compatible.length > 0
      ? 'results'
      : candidates.length > 0 ? 'incompatible' : 'connection_failed';
    onSnapshot({
      candidates: compatible.map((candidate) => ({
        endpoint_url: candidate.endpointUrl,
        group_display_name: candidate.discovery.group_display_name,
        group_id: candidate.discovery.group_id,
        group_tag: candidate.discovery.group_tag,
        provider_authorization_id: candidate.discovery.peer_id,
        provider_host_name: candidate.discovery.desktop_host_name,
        provider_host_platform: candidate.discovery.desktop_platform,
        timeline_id: candidate.discovery.timeline_id
      })),
      change: status === 'results' ? event.change : 'failed',
      error_code: status === 'results' ? null : status,
      status
    });
  };
  let handle: Awaited<ReturnType<typeof FolioleCompanionSync.addListener>> | null = null;
  try {
    handle = await FolioleCompanionSync.addListener('syncGroupDiscoveryChanged', (event) => void publish(event));
    await publish(await FolioleCompanionSync.startDiscoverySession());
  } catch {
    active = false;
    await handle?.remove().catch(() => undefined);
    onSnapshot({ candidates: [], change: 'failed', error_code: 'bridge_incompatible', status: 'incompatible' });
    return async () => undefined;
  }
  return async () => {
    active = false;
    await FolioleCompanionSync.stopDiscoverySession().catch(() => undefined);
    await handle.remove();
  };
}
