import { describe, expect, it } from 'vitest';

import {
  canonicalizeLibraryPath,
  createSyncGroupDeviceIdentity,
  isSameSyncGroupDevice,
  parseDeviceAnchor
} from './syncGroupUnifiedContract.js';

const ANCHOR_A = 'a1111111-1111-4111-8111-111111111111';
const ANCHOR_B = '22222222-2222-4222-8222-222222222222';

describe('Sync Group Device identity', () => {
  it('treats the same group, OS-user anchor, and canonical database path as one Device', () => {
    const development = identity(ANCHOR_A, '/Users/foliole/Library/../Library/Foliole/Data/foliole.db');
    const packaged = identity(ANCHOR_A, '/Users/foliole/Library/Foliole/Data/foliole.db');

    expect(isSameSyncGroupDevice(development, packaged)).toBe(true);
    expect(development.identity_key).toBe(packaged.identity_key);
  });

  it('makes a copied or moved database a different Device without inspecting its contents', () => {
    const original = identity(ANCHOR_A, '/Users/foliole/Foliole/Data/foliole.db');
    const copiedPath = identity(ANCHOR_A, '/Users/foliole/Foliole Copy/Data/foliole.db');
    const copiedDevice = identity(ANCHOR_B, '/Users/foliole/Foliole/Data/foliole.db');

    expect(isSameSyncGroupDevice(original, copiedPath)).toBe(false);
    expect(isSameSyncGroupDevice(original, copiedDevice)).toBe(false);
  });

  it('keeps host display names outside the identity contract', () => {
    const beforeRename = identity(ANCHOR_A, '/Users/foliole/Foliole/Data/foliole.db');
    const afterRename = identity(ANCHOR_A, '/Users/foliole/Foliole/Data/foliole.db');

    expect(isSameSyncGroupDevice(beforeRename, afterRename)).toBe(true);
    expect(beforeRename).not.toHaveProperty('host_name');
  });

  it('normalizes Windows drive, separator, namespace, and case aliases', () => {
    const ordinary = canonicalizeLibraryPath('C:/Users/Roamer/Foliole/Data/foliole.db', 'windows');
    const namespaced = canonicalizeLibraryPath('\\\\?\\c:\\users\\roamer\\Foliole\\Data\\foliole.db', 'windows');

    expect(ordinary).toBe('c:\\users\\roamer\\foliole\\data\\foliole.db');
    expect(namespaced).toBe(ordinary);
  });

  it('rejects non-canonical, non-v4, and uppercase anchors', () => {
    expect(parseDeviceAnchor(ANCHOR_A)).toBe(ANCHOR_A);
    expect(() => parseDeviceAnchor(ANCHOR_A.toUpperCase())).toThrow('device_anchor_invalid');
    expect(() => parseDeviceAnchor('11111111-1111-1111-8111-111111111111'))
      .toThrow('device_anchor_invalid');
  });
});

function identity(anchor: string, libraryPath: string) {
  return createSyncGroupDeviceIdentity({
    device_anchor: anchor,
    group_id: 'group-a',
    library_path: libraryPath,
    path_flavor: 'posix'
  });
}
