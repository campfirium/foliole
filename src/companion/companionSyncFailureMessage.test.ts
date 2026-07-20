import { describe, expect, it } from 'vitest';

import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';

describe('formatCompanionSyncFailureMessage', () => {
  it('hides companion SQLite connection internals without naming a platform', () => {
    expect(formatCompanionSyncFailureMessage(
      new Error('Connection foliole-companion does not exist')
    )).toBe('The device sync database connection was reset. Sync will retry.');
  });

  it('uses device copy when sync-pack apply has no lower-level cause', () => {
    expect(formatCompanionSyncFailureMessage(
      new Error('Failed to apply companion desktop sync pack.')
    )).toBe('Topic list sync failed: This device could not apply the desktop sync pack.');
  });
});
