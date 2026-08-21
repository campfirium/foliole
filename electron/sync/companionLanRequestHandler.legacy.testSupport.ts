import { createLanWorkspaceSyncRequestHandler } from './companionLanRequestHandler.js';

export function createLegacyLanWorkspaceSyncHandler() {
  return createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test',
    onPairRequestCreated: null,
    peerId: 'desktop-local',
    updatePairingStatus: () => undefined,
    getSyncStatus: () => ({
      advertised_urls: ['http://127.0.0.1:38641'], last_error: null, paired_authorization_count: 1,
      pending_pair_request_count: 0, port: 38641, state: 'running'
    })
  });
}
