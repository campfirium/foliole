import { afterEach, describe, expect, it, vi } from 'vitest';

import { shouldInjectIosDatabaseUpgradeFault } from './iosDatabaseUpgradeAcceptance';

describe('iOS database upgrade acceptance isolation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('requires both the upgrade scenario and its independent fault build flag', () => {
    vi.stubEnv('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO', 'database-upgrade-runtime');
    expect(shouldInjectIosDatabaseUpgradeFault()).toBe(false);
    vi.stubEnv('VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT', '1');
    expect(shouldInjectIosDatabaseUpgradeFault()).toBe(true);
    vi.stubEnv('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO', 'pairing-signed-transport');
    expect(shouldInjectIosDatabaseUpgradeFault()).toBe(false);
  });
});
