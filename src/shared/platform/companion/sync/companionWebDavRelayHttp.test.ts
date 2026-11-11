import { expect, it, vi } from 'vitest';

import type { FramedSyncFilePort } from '../../../../../lib/core/sync/framedSyncFilePort.js';
import { webDavRelayStatus } from '../../../../../lib/core/sync/webDavRelayPublication.js';
import { webDavRelayCredentialReference } from '../../../../../lib/platform/nativeWebDavRelayHttpContract.js';
import { syncSessionReplySchema } from '../../../../../lib/platform/syncSessionContract.js';
import { webDavRelayBindingSchema } from '../../../../../lib/platform/webDavRelayContract.js';

import { createCompanionWebDavRelayHttp } from './companionWebDavRelayHttp.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../companionWorkspaceRuntimeRepository.js', () => ({
  FolioleCompanionSync: { requestWebDavRelay: request }
}));

it('reports an Android transport failure with its counts and a safe reason when no response arrived', async () => {
  request.mockResolvedValue({ failed: true, status: 0, chunks: 0, uploaded_bytes: 17, downloaded_bytes: 0,
    failure_code: 'ConnectException' });
  const files = { remove: vi.fn(async () => {}) } as unknown as FramedSyncFilePort;
  const stats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const root = 'http://192.0.2.1/relay/';
  const transport = createCompanionWebDavRelayHttp(root, files, { library_key: 'test', generation_id: 'test' },
    stats, new AbortController().signal);
  await expect(transport(new URL(root), { method: 'PROPFIND' }, webDavRelayStatus))
    .rejects.toThrow('webdav_relay_transport_failed:ConnectException');
  expect(stats).toEqual({ requests: { PROPFIND: 1 }, responses: 0, uploadedBytes: 17, downloadedBytes: 0 });
  expect(files.remove).toHaveBeenCalledOnce();
});

it('passes an Android Retry-After response to the shared retry policy', async () => {
  request.mockResolvedValue({ failed: false, status: 503, chunks: 0, uploaded_bytes: 0, downloaded_bytes: 0,
    retry_after: '600' });
  const files = { remove: vi.fn(async () => {}) } as unknown as FramedSyncFilePort;
  const stats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const root = 'http://192.0.2.1/relay/';
  const transport = createCompanionWebDavRelayHttp(root, files, { library_key: 'test', generation_id: 'test' },
    stats, new AbortController().signal);
  const earliest = Date.now() + 600_000;
  const failure = await transport(new URL(root), { method: 'PROPFIND' }, webDavRelayStatus).catch(error => error);
  expect(failure).toMatchObject({ status: 503, message: 'webdav_relay_service_busy:503' });
  expect(failure.retryAt).toBeGreaterThanOrEqual(earliest);
  expect(stats).toEqual({ requests: { PROPFIND: 1 }, responses: 1, uploadedBytes: 0, downloadedBytes: 0 });
  expect(files.remove).toHaveBeenCalledOnce();
});

it('sends only a credential reference to Android and reports unavailable storage without counting an HTTP request', async () => {
  request.mockResolvedValue({ failed: true, status: 0, chunks: 0, uploaded_bytes: 0, downloaded_bytes: 0,
    failure_code: 'credential_unavailable' });
  const files = { remove: vi.fn(async () => {}) } as unknown as FramedSyncFilePort;
  const stats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const root = 'https://dav.example.test/relay/';
  const credential = webDavRelayCredentialReference({
    id: 'b79b3dbc-f46b-490c-8aab-ab5e09c0562b', group_id: 'group', desktop_device_id: 'desktop',
    phone_device_id: 'phone', directory_url: root, credential_version: 3
  }, 'library-epoch');
  const transport = createCompanionWebDavRelayHttp(root, files, { library_key: 'test', generation_id: 'test' },
    stats, new AbortController().signal, credential);

  await expect(transport(new URL(root), { method: 'PROPFIND' }, webDavRelayStatus))
    .rejects.toThrow('webdav_relay_credentials_unavailable');
  expect(request.mock.lastCall?.[0].credential).toEqual({
    binding_id: 'b79b3dbc-f46b-490c-8aab-ab5e09c0562b', group_id: 'group', desktop_device_id: 'desktop',
    phone_device_id: 'phone', library_epoch: 'library-epoch', version: '3'
  });
  expect(stats).toEqual({ requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 });
  expect(files.remove).toHaveBeenCalledOnce();
});

it('does not activate a credential version from a normal LAN binding response', () => {
  const binding = { id: crypto.randomUUID(), group_id: 'group', desktop_device_id: 'desktop', phone_device_id: 'phone',
    directory_url: 'https://dav.example.test/relay/', credential_version: 3 };
  const reply = syncSessionReplySchema.parse({
    session: crypto.randomUUID(), marker: { instance: crypto.randomUUID(), sequence: 0 },
    changed: false, webdav_relay: binding
  });
  expect(reply.webdav_relay).not.toHaveProperty('credential_version');
  expect(webDavRelayBindingSchema.safeParse({ ...binding, directory_url: 'http://dav.example.test/relay/' }).success).toBe(false);
});
