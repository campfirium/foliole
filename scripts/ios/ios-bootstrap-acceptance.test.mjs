// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  createAcceptanceBuildArgs,
  parseBootstrapSnapshot,
  selectSimulator,
  shouldShutdownSimulator,
  verifyBootstrapSnapshots,
  waitForBootstrapSnapshot
} from './ios-bootstrap-acceptance.mjs';

describe('iOS bootstrap acceptance contract', () => {
  it('keeps Simulator acceptance locally signed so Keychain remains available', () => {
    const args = createAcceptanceBuildArgs('SIM-1');

    expect(args).toContain('PRODUCT_BUNDLE_IDENTIFIER=com.foliole.ios.bootstrap-acceptance');
    expect(args).toContain('platform=iOS Simulator,id=SIM-1');
    expect(args).not.toContain('CODE_SIGNING_ALLOWED=NO');
  });

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

  it('waits through transient database states until bootstrap is semantically ready', async () => {
    const states = [
      new Error('database is locked'),
      { deviceId: '', tableCount: 1 },
      { deviceId: 'ios-device-1', tableCount: 3 }
    ];
    let launched = false;

    await expect(waitForBootstrapSnapshot(() => {
      const state = states.shift();
      if (state instanceof Error) throw state;
      return state;
    }, () => { launched = true; }, 500, 1)).resolves.toEqual({
      deviceId: 'ios-device-1',
      tableCount: 3
    });
    expect(launched).toBe(true);
  });

  it('fails after the bounded wait when bootstrap never becomes ready', async () => {
    await expect(waitForBootstrapSnapshot(
      () => ({ deviceId: '', tableCount: 1 }),
      () => {},
      5,
      1
    )).rejects.toThrow('device identity present=false, required tables=1');
  });
});
