import { describe, expect, it } from 'vitest';

import { allocateSyncGroupHostName, isAssignedSyncGroupHostName } from './syncGroupDeviceProfile.js';

describe('Sync Group device profiles', () => {
  it('allocates the smallest unused readable suffix and retains departed names', () => {
    expect(allocateSyncGroupHostName('Maci', ['Maci', 'Maci 2', 'Maci 4']))
      .toEqual({ host_name: 'Maci 3' });
  });

  it('recognizes only the base name and its assigned numeric forms', () => {
    expect(isAssignedSyncGroupHostName('Maci 2', 'Maci')).toBe(true);
    expect(isAssignedSyncGroupHostName('Maci 02', 'Maci')).toBe(false);
    expect(isAssignedSyncGroupHostName('Other 2', 'Maci')).toBe(false);
  });
});
