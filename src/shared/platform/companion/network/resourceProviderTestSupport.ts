import type { ResourceTransfer } from '../../../../../lib/core/sync/resourceProviderPass';
import { classifyResourceFailure, resourceKey, type ResourceNeed } from '../../../../../lib/platform/resourceAvailabilityContract';

// Transport tests use one already-qualified provider; discovery has its own contract tests.
export async function runCompanionResourceProviderBatch(args: {
  endpointUrl: string; needs: readonly ResourceNeed[];
  transfer: (endpointUrl: string, needs: readonly ResourceNeed[]) => Promise<ResourceTransfer>;
}) {
  try {
    const result = await args.transfer(args.endpointUrl, args.needs);
    return { ...result, unresolved: args.needs.map(resourceKey).filter((key) => !result.ready.includes(key)),
      issues: [], unresolvedState: 'unknown' as const };
  } catch (error) {
    return { ready: [], errors: {}, unresolved: args.needs.map(resourceKey),
      issues: [{ deviceId: 'fixture', error: classifyResourceFailure(error) }], unresolvedState: 'unknown' as const };
  }
}
