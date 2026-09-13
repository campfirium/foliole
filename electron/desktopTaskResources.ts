import { isDesktopTaskUnderPressure } from './desktopTaskPressure.js';
import type { DesktopTaskDefinition, DesktopTaskResource, DesktopTaskResourceClaim } from './desktopTaskTypes.js';

const RESOURCE_CAPACITY: Record<DesktopTaskResource, number> = {
  'cpu-heavy': 1,
  library: 4,
  'main-database-write': 1,
  total: 4
};

function taskClaims(definition: DesktopTaskDefinition): DesktopTaskResourceClaim[] {
  return definition.resources ?? [{ resource: 'total' }];
}

export function usesDesktopTaskResource(definition: DesktopTaskDefinition, resource: DesktopTaskResource) {
  return taskClaims(definition).some((claim) => claim.resource === resource);
}

export function hasDesktopTaskResourceCapacity(
  candidate: DesktopTaskDefinition,
  running: Iterable<DesktopTaskDefinition>
) {
  if (
    candidate.priority !== 'foreground' &&
    candidate.resources?.some((claim) => claim.resource === 'cpu-heavy') &&
    isDesktopTaskUnderPressure()
  ) {
    return false;
  }
  const runningDefinitions = [...running];
  return taskClaims(candidate).every((claim) => {
    const used = runningDefinitions.reduce((sum, definition) => {
      const matching = taskClaims(definition).find((entry) => entry.resource === claim.resource);
      return sum + (matching?.units ?? (matching ? 1 : 0));
    }, 0);
    return used + (claim.units ?? 1) <= RESOURCE_CAPACITY[claim.resource];
  });
}
