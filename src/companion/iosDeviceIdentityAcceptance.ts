import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';

import { postResult } from './iosBridgeAcceptance';

export async function runIosDeviceIdentityAcceptance() {
  try {
    const bootstrap = await loadCompanionBootstrapState();
    postResult({
      database_path: bootstrap.database_path,
      error: null,
      phase: 'anchor-observed',
      scenario: 'device-identity',
      status: 'passed'
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'device-identity',
      status: 'failed'
    });
  }
}
