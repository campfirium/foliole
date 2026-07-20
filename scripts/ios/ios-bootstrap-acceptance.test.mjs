// @vitest-environment node
/* global setTimeout */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseBootstrapSnapshot,
  selectSimulator,
  shouldShutdownSimulator,
  verifyBootstrapSnapshots,
  waitForFileCreated
} from './ios-bootstrap-acceptance.mjs';

describe('iOS bootstrap acceptance contract', () => {
  it('prefers an already booted iPhone simulator', () => {
    expect(selectSimulator({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
          { isAvailable: true, name: 'iPhone 17', state: 'Shutdown', udid: 'SIM-1' },
          { isAvailable: true, name: 'iPhone 13 mini', state: 'Booted', udid: 'SIM-2' }
        ]
      }
    }).udid).toBe('SIM-2');
  });

  it('shuts down only a simulator started by the acceptance run', () => {
    expect(shouldShutdownSimulator({ state: 'Shutdown' })).toBe(true);
    expect(shouldShutdownSimulator({ state: 'Booted' })).toBe(false);
  });

  it('accepts a stable database identity and required schema after restart', () => {
    const first = parseBootstrapSnapshot('ios-device-1\n3\n');
    const second = parseBootstrapSnapshot('ios-device-1\n3\n');

    expect(verifyBootstrapSnapshots(first, second)).toEqual({
      databaseReady: true,
      deviceId: 'ios-device-1',
      requiredTableCount: 3
    });
  });

  it('rejects an identity that changes after restart', () => {
    expect(() => verifyBootstrapSnapshots(
      { deviceId: 'ios-device-1', tableCount: 3 },
      { deviceId: 'ios-device-2', tableCount: 3 }
    )).toThrow('device identity changed');
  });

  it('waits only until the asynchronously created database becomes available', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'foliole-ios-bootstrap-'));
    const database = path.join(root, 'foliole-companionSQLite.db');

    await expect(waitForFileCreated(database, () => {
      setTimeout(() => writeFileSync(database, 'ready'), 10);
    }, 500, 5)).resolves.toBeUndefined();
  });
});
