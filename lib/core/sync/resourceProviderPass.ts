import { classifyResourceFailure, parseResourceClaims, RESOURCE_CLAIM_TTL_MS, resourceKey,
  type ResourceClaim, type ResourceFailure, type ResourceNeed } from '../../platform/resourceAvailabilityContract.js';
export type ResourceProvider = { deviceId: string; endpointUrl: string };
export type ResourceIssue = { deviceId: string; resourceKey?: string; error: ResourceFailure };
export type ProviderObservation<P> = { provider: P; claims: ResourceClaim[]; expiresAt: number; failed: boolean };
export type ResourceTransfer = { ready: string[]; errors: Record<string, ResourceFailure> };
export async function observeResourceProviders<P extends ResourceProvider>(args: {
  providers: readonly P[]; needs: readonly ResourceNeed[]; query: (provider: P, needs: readonly ResourceNeed[]) => Promise<unknown>;
  now?: () => number;
}) {
  const observations: ProviderObservation<P>[] = [], issues: ResourceIssue[] = [];
  for (let index = 0; index < args.providers.length; index += 4) {
    const batch = await Promise.all(args.providers.slice(index, index + 4).map(async (provider) => {
      try {
        const claims = parseResourceClaims(await args.query(provider, args.needs), provider.deviceId, args.needs);
        for (const claim of claims) if (claim.status === 'checksum_mismatch') {
          issues.push({ deviceId: provider.deviceId, resourceKey: resourceKey(claim), error: 'checksum_mismatch' });
        }
        return { provider, claims, expiresAt: (args.now ?? Date.now)() + RESOURCE_CLAIM_TTL_MS, failed: false };
      } catch (error) {
        issues.push({ deviceId: provider.deviceId, error: classifyResourceFailure(error) });
        return { provider, claims: [], expiresAt: 0, failed: true };
      }
    }));
    observations.push(...batch);
  }
  return { observations, issues };
}
export async function transferResourceProviders<P extends ResourceProvider>(args: {
  observations: ProviderObservation<P>[]; needs: readonly ResourceNeed[];
  transfer: (provider: P, needs: readonly ResourceNeed[]) => Promise<ResourceTransfer>;
  eligibleDeviceIds: readonly string[]; now?: () => number;
  refresh?: (provider: P, needs: readonly ResourceNeed[]) => Promise<unknown>;
}) {
  const unresolved = new Map(args.needs.map((need) => [resourceKey(need), need]));
  const ready: string[] = [], issues: ResourceIssue[] = [];
  for (const observation of args.observations) {
    if (!unresolved.size) break;
    if (!args.eligibleDeviceIds.includes(observation.provider.deviceId)) continue;
    if (observation.expiresAt <= (args.now ?? Date.now)()) {
      if (!args.refresh || observation.failed) continue;
      const refreshed = await observeResourceProviders({ providers: [observation.provider],
        needs: [...unresolved.values()], query: args.refresh, ...(args.now ? { now: args.now } : {}) });
      Object.assign(observation, refreshed.observations[0]);
      issues.push(...refreshed.issues);
      if (observation.failed) continue;
    }
    const selected = observation.claims.filter((claim) => claim.status === 'available' && unresolved.has(resourceKey(claim)));
    if (!selected.length) continue;
    let result: ResourceTransfer;
    try { result = await args.transfer(observation.provider, selected); }
    catch (error) { result = { ready: [], errors: Object.fromEntries(selected.map((need) => [resourceKey(need), classifyResourceFailure(error)])) }; }
    for (const resource of selected) {
      const key = resourceKey(resource);
      if (result.ready.includes(key) && !result.errors[key]) { unresolved.delete(key); ready.push(key); }
      else {
        observation.claims = observation.claims.filter((claim) => resourceKey(claim) !== key);
        issues.push({ deviceId: observation.provider.deviceId, resourceKey: key, error: result.errors[key] ?? 'protocol_error' });
      }
    }
  }
  const unknown = args.eligibleDeviceIds.some((id) => !args.observations.some((o) => o.provider.deviceId === id && !o.failed)) ||
    args.observations.some((o) => args.eligibleDeviceIds.includes(o.provider.deviceId) && o.expiresAt <= (args.now ?? Date.now)()) || issues.some((issue) => issue.error !== 'missing_file');
  return { ready, unresolved: [...unresolved.keys()], issues, unresolvedState: unknown ? 'unknown' as const : 'no_declared_holder' as const };
}
