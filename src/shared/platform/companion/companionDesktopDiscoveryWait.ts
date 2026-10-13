import type {
  CompanionDiscoveryCandidate,
  CompanionNativeDiscoveryEvent,
  CompanionWorkspaceSyncPlugin
} from '../companionWorkspaceSyncPluginTypes';

const DESKTOP_DISCOVERY_WAIT_MS = 10_000;

export function companionPeerAdvertisements(event: {
  candidates?: CompanionDiscoveryCandidate[];
}, requiredGroupId?: string) {
  return (event.candidates ?? []).filter((candidate) => {
    return candidate.source === 'nsd'
      && (!requiredGroupId || candidate.protocol_txt?.group_id === requiredGroupId);
  });
}

export async function waitForCompanionDesktopAdvertisements(
  plugin: Pick<CompanionWorkspaceSyncPlugin,
    'addListener' | 'startDiscoverySession' | 'stopDiscoverySession'>,
  timeoutMs = DESKTOP_DISCOVERY_WAIT_MS,
  requiredGroupId?: string
) {
  let active = true;
  let handle: Awaited<ReturnType<typeof plugin.addListener>> | null = null;
  let started = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return await new Promise<CompanionDiscoveryCandidate[]>((resolve) => {
    const finish = (candidates: CompanionDiscoveryCandidate[]) => {
      if (!active) return;
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      void Promise.resolve(started ? plugin.stopDiscoverySession() : undefined)
        .catch(() => undefined)
        .then(() => handle?.remove().catch(() => undefined))
        .then(() => resolve(candidates));
    };
    const inspect = (event: CompanionNativeDiscoveryEvent) => {
      const candidates = companionPeerAdvertisements(event, requiredGroupId);
      if (candidates.length > 0) finish(candidates);
      else if (event.status === 'permission_required' || event.status === 'unavailable') finish([]);
    };
    timeoutId = setTimeout(() => finish([]), timeoutMs);
    void plugin.addListener('syncGroupDiscoveryChanged', inspect).then(async (listener) => {
      handle = listener;
      if (!active) return void listener.remove().catch(() => undefined);
      try {
        started = true;
        inspect(await plugin.startDiscoverySession());
      } catch {
        finish([]);
      }
    }, () => finish([]));
  });
}
