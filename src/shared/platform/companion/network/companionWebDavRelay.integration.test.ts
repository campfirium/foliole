// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { withWebDavFixture } from '../../../../../electron/sync/webDavRelay.testSupport.js';
import type { WebDavCredentialOffer, WebDavCredentialReply } from '../../../../../lib/platform/webDavCredentialDeliveryContract.js';
import type { WebDavAttachmentPolicy } from '../../../../../lib/platform/webDavRelayContract.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';
import {
  clearCompanionWebDavCredentialDelivery, confirmCompanionWebDavCredential, receiveCompanionWebDavCredentialDelivery
} from '../sync/companionWebDavCredentialDelivery.js';
import { loadCompanionWebDavRelay, receiveCompanionWebDavRelay } from '../sync/companionWebDavRelayStore.js';

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

it.skipIf(process.platform !== 'darwin')('keeps the installed credential version when LAN updates attachment policy', async () => {
  const mobile = await createCompanionRequestFixture();
  const { fixture } = mobile;
  const binding = {
    id: 'b79b3dbc-f46b-490c-8aab-ab5e09c0562b', group_id: 't326-group',
    desktop_device_id: fixture.rightSnapshot.deviceId, phone_device_id: fixture.leftSnapshot.deviceId,
    directory_url: 'https://dav.example.test/relay/'
  };
  try {
    // Establish the starting state owned by the future trusted installer.
    await mobile.db.run('INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      ['webdav_relay_binding', JSON.stringify({ ...binding, credential_version: 3 }), new Date().toISOString()]);
    await receiveCompanionWebDavRelay({ ...binding, attachment_policy: { mode: 'off' } }, binding.desktop_device_id);
    await mobile.restart();
    expect(await loadCompanionWebDavRelay()).toEqual({
      ...binding, attachment_policy: { mode: 'off' }, credential_version: 3
    });
  } finally {
    await mobile.close();
  }
});

it.skipIf(process.platform !== 'darwin')('activates the installed binding only after the phone verifies WebDAV access', async () => {
  const mobile = await createCompanionRequestFixture();
  const { fixture } = mobile;
  const phone = fixture.leftSnapshot.deviceId;
  const peer = fixture.rightSnapshot.deviceId;
  const offer: WebDavCredentialOffer = {
    id: '94235b46-54e9-43a3-a03d-d291004bdf89', desktop_key: 'desktop-key',
    version: 3, library_epoch: `${phone}-epoch`,
    binding: { id: 'b79b3dbc-f46b-490c-8aab-ab5e09c0562b', group_id: 't326-group',
      desktop_device_id: peer, phone_device_id: phone, directory_url: 'https://dav.example.test/relay/' }
  };
  const envelope = { iv: 'fixture-iv', ciphertext: 'fixture-ciphertext' };
  const signal = new AbortController().signal;
  const send = vi.fn(async (reply: WebDavCredentialReply) => {
    if (reply.receipt) expect(await loadCompanionWebDavRelay()).toMatchObject({ credential_version: 3 });
  });
  native.webDavPrepare.mockResolvedValue({ phone_key: 'phone-key', fingerprint: 'compared-fingerprint' });
  native.webDavConfirm.mockResolvedValue({ confirmation: 'confirmed' });
  native.webDavInstall.mockResolvedValue({ receipt: 'installed' });
  const response = { chunks: 0, uploaded_bytes: 0, downloaded_bytes: 0, failed: false };
  native.webDavRequest.mockResolvedValueOnce({ ...response, status: 401 }).mockResolvedValueOnce({ ...response, status: 207 });
  try {
    await receiveCompanionWebDavCredentialDelivery({ offer, envelope }, peer, send, signal);
    expect(native.webDavInstall).not.toHaveBeenCalled();
    await confirmCompanionWebDavCredential('compared-fingerprint');
    await receiveCompanionWebDavCredentialDelivery({ offer, envelope }, peer, send, signal);
    expect(await loadCompanionWebDavRelay()).toBeNull();
    expect(send.mock.calls.some(([reply]) => reply.receipt)).toBe(false);
    await confirmCompanionWebDavCredential('compared-fingerprint');
    await receiveCompanionWebDavCredentialDelivery({ offer, envelope }, peer, send, signal);
    expect(send).toHaveBeenLastCalledWith({ id: offer.id, phone_key: 'phone-key', receipt: 'installed' });
    await mobile.restart();
    expect(await loadCompanionWebDavRelay()).toMatchObject({ ...offer.binding, credential_version: 3 });
  } finally {
    clearCompanionWebDavCredentialDelivery();
    await mobile.close();
  }
});
