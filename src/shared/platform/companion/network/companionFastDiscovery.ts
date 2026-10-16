import { isMobileSyncPlatform } from '../../../../../lib/platform/syncSchedulingPlatform';
import type { CompanionDiscoveryResult, DiscoveryCandidate } from '../../companionWorkspaceDiscovery';

import { acquireCompanionDiscovery } from './companionDiscoveryLease';

export async function discoverReachableDesktop(preferred: string, groupId: string,
  probe: (candidate: DiscoveryCandidate, signal: AbortSignal) => Promise<CompanionDiscoveryResult | null>,
  signal?: AbortSignal) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const results: CompanionDiscoveryResult[] = [];
  const seen = new Set<string>();
  let complete!: () => void;
  const finished = new Promise<void>(resolve => { complete = resolve; });
  let done = false;
  const finish = () => { if (!done) { done = true; complete(); } };
  const abort = () => { controller.abort(signal?.reason); finish(); };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(finish, 5000);
  const inspect = (candidate: DiscoveryCandidate) => {
    const key = `${candidate.source}:${candidate.endpointUrl}`;
    if (done || seen.has(key)) return;
    seen.add(key);
    void probe(candidate, controller.signal).then(result => {
      if (done || !result || result.discovery.group_id !== groupId) return;
      results.push(result);
      if (result.compatibility.status === 'compatible'
        && !isMobileSyncPlatform(result.discovery.provider_platform)) finish();
    }).catch(() => undefined);
  };
  if (preferred) inspect({ endpointUrl: preferred, protocolTxt: null, source: 'direct' });
  const subscription = acquireCompanionDiscovery(event => {
    for (const candidate of event.candidates) {
      if (candidate.source !== 'nsd' || candidate.protocol_txt?.group_id !== groupId) continue;
      inspect({ endpointUrl: candidate.endpoint_url, protocolTxt: candidate.protocol_txt ?? null, source: 'nsd' });
    }
  });
  // Failure to browse does not discard a still-pending preferred-address probe.
  void subscription.catch(() => undefined);
  try {
    await finished;
    signal?.throwIfAborted();
    return results;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
    const release = await subscription.catch(() => null);
    await release?.();
  }
}
