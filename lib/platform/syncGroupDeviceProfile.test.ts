import { describe, expect, it } from 'vitest';

import { allocateSyncGroupDeviceProfile, isAssignedSyncGroupDeviceName } from './syncGroupDeviceProfile.js';

describe('Sync Group device profiles', () => {
  it('allocates the smallest unused readable suffix and retains departed names', () => {
    expect(allocateSyncGroupDeviceProfile('Maci', ['Maci', 'Maci 2', 'Maci 4'])).toEqual({
      device_id: 'Maci 3', device_name: 'Maci 3'
    });
  });

  it('recognizes only the base name and its assigned numeric forms', () => {
    expect(isAssignedSyncGroupDeviceName('Maci 2', 'Maci')).toBe(true);
    expect(isAssignedSyncGroupDeviceName('Maci 02', 'Maci')).toBe(false);
    expect(isAssignedSyncGroupDeviceName('Other 2', 'Maci')).toBe(false);
  });
});
