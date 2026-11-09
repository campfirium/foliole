// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { withWebDavFixture } from '../../../../../electron/sync/webDavRelay.testSupport.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';
import { loadCompanionWebDavRelay } from '../sync/companionWebDavRelayStore.js';

import { captureCompanionDesktopRound, closeCompanionDesktopSession, ensureCompanionDesktopSession } from './companionDesktopSession.js';

vi.mock('../../companionRuntimeCapabilities', async original => ({
  ...await original<typeof import('../../companionRuntimeCapabilities')>(),
  getCompanionRuntimeCapability: () => ({ kind: 'android-native', platform: 'android' })
}));

vi.mock('./signedRequest.js', () => ({ createSignedRequestHeaders: async (input: {
  endpointUrl: string; method: string; pathWithQuery: string
}) => (await native.sign({ endpoint_url: input.endpointUrl, method: input.method,
  path_with_query: input.pathWithQuery, sync_group_id: 't326-group' })).headers }));

it.skipIf(process.platform !== 'darwin')('receives the Mac-selected binding after reconnect and confirms it after persisting', async () => {
  const mobile = await createCompanionRequestFixture();
  installSessionHttpBoundary();
  const { fixture } = mobile;
  const phoneId = fixture.leftSnapshot.deviceId;
  const { origin, deviceId } = fixture.rightSnapshot;
  try {
    await withWebDavFixture(false, async directory => {
      await fixture.right.invoke('webdav_phone', { phoneId });
      await fixture.right.invoke('webdav_directory', { directory });
      await ensureCompanionDesktopSession(origin, deviceId);
      expect(await loadCompanionWebDavRelay()).toBeNull();
      await fixture.right.invoke('webdav_enable', { phoneId });
      await closeCompanionDesktopSession();

      expect(await fixture.right.invoke('webdav_overview')).toMatchObject({ device_id: phoneId, delivered: false });
      await ensureCompanionDesktopSession(origin, deviceId);
      const binding = await loadCompanionWebDavRelay();
      expect(binding).toMatchObject({ phone_device_id: phoneId, directory_url: `${directory}/` });
      await mobile.sync({ onDatabaseConfirmed: captureCompanionDesktopRound(origin) });
      expect(await fixture.right.invoke('webdav_overview')).toMatchObject({ device_id: phoneId, delivered: true });
      await closeCompanionDesktopSession();
      await mobile.restart();
      expect(await loadCompanionWebDavRelay()).toEqual(binding);
      const restarted = await fixture.restartRight();
      expect(await restarted.process.invoke('webdav_overview')).toMatchObject({ device_id: phoneId, delivered: true });
    });
  } finally {
    await closeCompanionDesktopSession();
    await mobile.close();
  }
});
