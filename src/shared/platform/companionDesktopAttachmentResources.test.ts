import './companion/companionDesktopAttachmentResources.testSupport';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { attachment, deferred, key, peers, readyState, resetAttachmentFixture } from './companion/companionDesktopAttachmentResources.testSupport';
import { syncCompanionAttachmentResourceFromDesktop } from './companionDesktopAttachmentResources';

beforeEach(() => { resetAttachmentFixture(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { expect(attachment.listeners.size).toBe(0); vi.restoreAllMocks(); });
const sync = () => syncCompanionAttachmentResourceFromDesktop('http://preferred', 'selected');

it('changes source after a failure and keeps the exact selected key', async () => {
  attachment.pull.mockRejectedValueOnce(new Error('attachment_source_missing'));
  expect(await sync()).toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.exchange.mock.calls.map(([peer]) => peer)).toEqual(peers);
  expect(attachment.pull.mock.calls.map(([input]) => [input.receiver_device_id, input.storageKey]))
    .toEqual([['first', key], ['second', key]]);
  expect(attachment.exchange.mock.invocationCallOrder[1]).toBeLessThan(attachment.pull.mock.invocationCallOrder[1]!);
  expect(attachment.invalidate).toHaveBeenCalledExactlyOnceWith('selected');
});

it('attempts each source once and leaves the target missing when every source returns 404', async () => {
  attachment.pull.mockRejectedValue(new Error('attachment_resource_http_404'));
  expect(await sync()).toEqual({ attachmentId: 'selected', status: 'missing' });
  expect(attachment.exchange).toHaveBeenCalledTimes(2);
  expect(attachment.pull.mock.calls.map(([input]) => input.receiver_device_id)).toEqual(['first', 'second']);
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it('does not pull from a candidate whose member authorization failed', async () => {
  attachment.exchange.mockRejectedValueOnce(new Error('sync_group_member_state_failed_401'));
  expect(await sync()).toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.pull).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ receiver_device_id: 'second' }));
});

it.each([
  { peerRemoved: true }, { normalSyncReady: false }, { peerLibraryEpoch: null }
])('skips a candidate with unavailable member state: %j', async unavailable => {
  attachment.exchange.mockResolvedValueOnce({ ...readyState, ...unavailable });
  expect(await sync()).toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.pull).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ receiver_device_id: 'second' }));
});

it('stops after local group exit without trying another source', async () => {
  attachment.exchange.mockResolvedValueOnce({ ...readyState, localExited: true });
  expect(await sync()).toEqual({ attachmentId: 'selected', status: 'missing' });
  expect(attachment.exchange).toHaveBeenCalledTimes(1);
  expect(attachment.pull).not.toHaveBeenCalled();
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it('reports disk exhaustion with its original cause and never changes source or marks cached', async () => {
  const cause = Object.assign(new Error('write failed'), { code: 'ENOSPC' });
  attachment.pull.mockRejectedValueOnce(cause);
  const failure: unknown = await sync().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('Expected disk exhaustion');
  expect(failure.message).toBe('attachment_resource_disk_full');
  expect(failure.cause).toBe(cause);
  expect(attachment.exchange).toHaveBeenCalledTimes(1);
  expect(attachment.pull).toHaveBeenCalledTimes(1);
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it.each(['request_sync_library_changed', 'request_sync_library_closed', 'attachment_generation_mismatch',
  'sync_round_owner_closed'])('stops the operation after %s without trying another library or source', async message => {
  const error = new Error(message);
  attachment.pull.mockRejectedValueOnce(error);
  await expect(sync()).rejects.toBe(error);
  expect(attachment.pull).toHaveBeenCalledTimes(1);
  expect(attachment.exchange).toHaveBeenCalledTimes(1);
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it('rejects background work before discovery or transfer', async () => {
  attachment.active = false;
  await expect(sync()).rejects.toThrow('request_sync_foreground_ended');
  expect(attachment.providers).not.toHaveBeenCalled();
  expect(attachment.pull).not.toHaveBeenCalled();
});

it('cancels an active native pull on background without falling through to another source', async () => {
  const started = deferred();
  attachment.pull.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
    started.resolve();
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      signal.throwIfAborted();
    });
  });
  const pending = sync();
  const rejected = expect(pending).rejects.toThrow('request_sync_foreground_ended');
  await started.promise;
  attachment.active = false;
  for (const listener of [...attachment.listeners]) listener();
  await rejected;
  expect(attachment.exchange).toHaveBeenCalledTimes(1);
  expect(attachment.pull).toHaveBeenCalledTimes(1);
  expect(attachment.invalidate).not.toHaveBeenCalled();
});
