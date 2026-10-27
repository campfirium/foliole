import './companion/companionDesktopAttachmentResources.testSupport';

import { beforeEach, expect, it } from 'vitest';

import { attachment, deferred, key, peers, resetAttachmentFixture } from './companion/companionDesktopAttachmentResources.testSupport';
import { syncCompanionAttachmentResourceFromDesktop } from './companionDesktopAttachmentResources';

beforeEach(resetAttachmentFixture);

it.each(['android', 'ios'])('pulls only the selected attachment and refreshes after completion on %s', async platform => {
  attachment.platform = platform;
  expect(await syncCompanionAttachmentResourceFromDesktop('http://preferred/', 'selected'))
    .toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.missing).toHaveBeenCalledExactlyOnceWith('selected');
  expect(attachment.providers).toHaveBeenCalledExactlyOnceWith('http://preferred/');
  expect(attachment.exchange).toHaveBeenCalledExactlyOnceWith(peers[0]);
  expect(attachment.pull).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    endpoint_url: peers[0]!.endpointUrl, sync_group_id: 'group', receiver_device_id: 'first',
    receiver_library_epoch: 'peer-epoch', storageKey: key, signal: expect.any(AbortSignal),
    peerRound: expect.objectContaining({ id: expect.any(String) })
  }));
  expect(attachment.exchange.mock.invocationCallOrder[0]).toBeLessThan(attachment.pull.mock.invocationCallOrder[0]!);
  expect(attachment.invalidate).toHaveBeenCalledExactlyOnceWith(key);
  expect(attachment.pull.mock.invocationCallOrder[0]).toBeLessThan(attachment.invalidate.mock.invocationCallOrder[0]!);
});

it('does not start discovery or transfer when the requested attachment is already local', async () => {
  attachment.missing.mockResolvedValue(null);
  expect(await syncCompanionAttachmentResourceFromDesktop('http://preferred', 'selected'))
    .toEqual({ attachmentId: 'selected', status: 'not_queued' });
  expect(attachment.providers).not.toHaveBeenCalled();
  expect(attachment.pull).not.toHaveBeenCalled();
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it('leaves a missing attachment pending outside native runtimes', async () => {
  attachment.platform = 'web';
  expect(await syncCompanionAttachmentResourceFromDesktop('http://preferred', 'selected'))
    .toEqual({ attachmentId: 'selected', status: 'missing' });
  expect(attachment.providers).not.toHaveBeenCalled();
  expect(attachment.pull).not.toHaveBeenCalled();
  expect(attachment.invalidate).not.toHaveBeenCalled();
});

it('does not report cached or refresh while the selected transfer is unfinished', async () => {
  const started = deferred(), finish = deferred();
  attachment.pull.mockImplementation(async () => { started.resolve(); await finish.promise; return { complete: true, blocks: 1 }; });
  let settled = false;
  const pending = syncCompanionAttachmentResourceFromDesktop('http://preferred', 'selected')
    .then(result => { settled = true; return result; });
  try {
    await started.promise;
    expect(settled).toBe(false);
    expect(attachment.invalidate).not.toHaveBeenCalled();
  } finally { finish.resolve(); }
  expect(await pending).toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.invalidate).toHaveBeenCalledExactlyOnceWith(key);
});


it('releases each partial resource round and reports cached only after the selected file completes', async () => {
  attachment.pull.mockResolvedValueOnce({ complete: false, blocks: 1 });
  expect(await syncCompanionAttachmentResourceFromDesktop('http://preferred', 'selected'))
    .toEqual({ attachmentId: 'selected', status: 'cached' });
  expect(attachment.round).toHaveBeenCalledTimes(2);
  expect(attachment.round.mock.calls.every(([, , options]) => options.resourceOnly)).toBe(true);
  expect(attachment.pull.mock.calls.map(([input]) => input.storageKey)).toEqual([key, key]);
  expect(attachment.invalidate).toHaveBeenCalledExactlyOnceWith(key);
});
