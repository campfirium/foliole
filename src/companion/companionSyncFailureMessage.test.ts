import { describe, expect, it } from 'vitest';

import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';

describe('formatCompanionSyncFailureMessage', () => {
  it('hides Android companion SQLite connection internals from sync activity', () => {
    expect(formatCompanionSyncFailureMessage(
      new Error('Connection foliole-companion does not exist')
    )).toBe('Android sync database connection was reset. Sync will retry.');
  });
});
