// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { withWebDavFixture } from '../../../../../electron/sync/webDavRelay.testSupport.js';
import type { WebDavAttachmentPolicy } from '../../../../../lib/platform/webDavRelayContract.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';
import { loadCompanionWebDavRelay } from '../sync/companionWebDavRelayStore.js';

import { captureCompanionDesktopRound, closeCompanionDesktopSession, ensureCompanionDesktopSession,
  subscribeCompanionDesktopChanges, waitForCompanionDesktopChanges } from './companionDesktopSession.js';

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
      expect(binding).toMatchObject({ phone_device_id: phoneId, directory_url: `${directory}/`,
        attachment_policy: { mode: 'unlimited' } });
      await mobile.sync({ onDatabaseConfirmed: captureCompanionDesktopRound(origin) });
      expect(await fixture.right.invoke('webdav_overview')).toMatchObject({ device_id: phoneId, delivered: true });
      const stop = subscribeCompanionDesktopChanges(async () => {});
      const limited = { mode: 'limited', max_mib: 2 } as const;
      try {
        waitForCompanionDesktopChanges();
        const updates: WebDavAttachmentPolicy[] = [{ mode: 'off' }, { mode: 'unlimited' },
          { mode: 'limited', max_mib: 1 }, limited];
        for (const policy of updates) {
          await fixture.right.invoke('webdav_attachment_policy', { policy });
          await vi.waitFor(async () => expect(await loadCompanionWebDavRelay()).toEqual({ ...binding, attachment_policy: policy }));
        }
      } finally { stop(); }
      await mobile.restart();
      expect(await loadCompanionWebDavRelay()).toEqual({ ...binding, attachment_policy: limited });
      const restarted = await fixture.restartRight();
      expect(await restarted.process.invoke('webdav_overview')).toMatchObject({
        device_id: phoneId, delivered: true, attachment_policy: limited
      });
    });
  } finally {
    await closeCompanionDesktopSession();
    await mobile.close();
  }
});
