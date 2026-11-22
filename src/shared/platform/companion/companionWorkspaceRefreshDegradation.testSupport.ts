import { afterAll, afterEach, expect } from 'vitest';

import { subscribeCompanionWorkspaceRefreshDegradation, type CompanionWorkspaceRefreshDegradation } from './companionWorkspaceRefreshDegradation';

/**
 * Fails each test whose writes left a refresh that reread the whole library although they named what they changed.
 * Call `reset()` once the fixture is built, so its own setup reads do not count.
 */
export function watchCompanionWorkspaceRefreshDegradations() {
  const seen: CompanionWorkspaceRefreshDegradation[] = [];
  const stop = subscribeCompanionWorkspaceRefreshDegradation(reason => { seen.push(reason); });
  afterEach(() => {
    const found = seen.splice(0);
    expect(found, 'a refresh after a write reread the whole library').toEqual([]);
  });
  afterAll(stop);
  return { reset: () => { seen.length = 0; } };
}
