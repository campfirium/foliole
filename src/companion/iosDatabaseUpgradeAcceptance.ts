import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import {
  initializeIosCompanionDatabase,
  type IosCompanionDatabaseBootstrapOptions
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { normalizeCompanionBootstrapState } from '../shared/platform/companionBootstrap';

import { postResult } from './iosBridgeAcceptance';

interface BootstrapPlugin {
  loadBootstrap(): Promise<NativeCompanionBootstrapState>;
}

const Bootstrap = registerPlugin<BootstrapPlugin>('FolioleCompanionBootstrap');

export function shouldInjectIosDatabaseUpgradeFault() {
  return import.meta.env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO === 'database-upgrade-runtime' &&
    import.meta.env.VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT === '1';
}

export function createIosDatabaseUpgradeBootstrapOptions(
  injectFault = shouldInjectIosDatabaseUpgradeFault()
): IosCompanionDatabaseBootstrapOptions {
  if (!injectFault) return {};
  return {
    afterRepair: (index) => {
      if (index === 0) throw new Error('Injected iOS database upgrade acceptance fault.');
    }
  };
}

export async function runIosDatabaseUpgradeAcceptance() {
  try {
    const native = normalizeCompanionBootstrapState(await Bootstrap.loadBootstrap());
    if (!native) throw new Error('Native companion bootstrap returned an invalid payload.');
    const bootstrap = await initializeIosCompanionDatabase(
      native,
      undefined,
      createIosDatabaseUpgradeBootstrapOptions()
    );
    postResult({ bootstrap, error: null, phase: 'upgraded', scenario: 'database-upgrade-runtime', status: 'passed' });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'database-upgrade-runtime',
      status: 'failed'
    });
  }
}
