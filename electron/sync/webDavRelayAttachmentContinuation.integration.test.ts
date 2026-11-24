// @vitest-environment node
import { readFile, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { enqueueWebDavRelayAttachments } from '../../lib/core/sync/webDavRelayAttachments.js';
import { WEB_DAV_ATTACHMENT_MIB } from '../../lib/platform/webDavRelayContract.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

it.each([65, 129])('relays %i phone attachments with bounded manual continuation', async count => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const files = Array.from({ length: count }, (_, i) => Buffer.from(`Attachment ${i}`))
      .map(bytes => ({ key: storageKey(bytes), bytes }));
    const afterBaseline = new Date((await fixture.scope(phone.peer))!.baseline.capturedAt + 1_000);
    for (const { key, bytes } of files) {
      const file = path.join(phone.assets, key);
      await writeFile(file, bytes);
      await utimes(file, afterBaseline, afterBaseline);
    }
    await edit(phone.peer, files.map(({ key }) => key), 'manual-attachments');

    const requestSend = vi.fn();
    const options = { continueAttachmentBatches: true, requestSend };
    const first = await fixture.sync(phone, undefined, options);
    expect(first).toMatchObject({ attachmentsPending: count > 128 });
    expect(requestSend).toHaveBeenCalledTimes(count > 128 ? 1 : 0);
    if (count > 128) {
      expect(fixture.uploads.length).toBeGreaterThan(64);
      expect(fixture.uploads.length).toBeLessThanOrEqual(128);
      await phone.reopen();
      const uploadsBeforeReceive = fixture.uploads.length;
      expect(await fixture.sync(phone, undefined, { foregroundReceive: true })).toMatchObject({ attachmentsPending: true });
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60_000);
      try {
        expect(await fixture.sync(phone, undefined, { foregroundReceive: true })).toMatchObject({ attachmentsPending: true });
      } finally { clock.mockRestore(); }
      expect(fixture.uploads).toHaveLength(uploadsBeforeReceive);
      expect(await fixture.sync(phone, undefined, { requestSend })).toMatchObject({ attachmentsPending: false });
    }
    expect(fixture.uploads).toHaveLength(count);
    await fixture.sync(mac);
    await mac.reopen();
    for (const { key, bytes } of files) expect(await readFile(path.join(mac.assets, key))).toEqual(bytes);
  } finally { await fixture.close(); }
});

it('requests a later send when a full batch is settled without uploading', async () => {
  const fixture = await relayFixture({ mode: 'limited', max_mib: 1 });
  try {
    const [mac, phone] = fixture.peers;
    const scope = (await fixture.scope(phone.peer))!;
    const oversized = Buffer.alloc(WEB_DAV_ATTACHMENT_MIB + 1);
    const oversizedKeys: string[] = [];
    for (let index = 0; index < 64; index++) {
      oversized[0] = index;
      const key = storageKey(oversized);
      oversizedKeys.push(key);
      await writeFile(path.join(phone.assets, key), oversized);
    }
    const bytes = Buffer.from('Small queued attachment');
    const last = { key: storageKey(bytes), bytes };
    await writeFile(path.join(phone.assets, last.key), bytes);
    await edit(phone.peer, [], 'before-queued-attachments');
    expect(await fixture.sync(phone)).toMatchObject({ published: 1 });
    await enqueueWebDavRelayAttachments(phone.peer.db, scope, [...oversizedKeys, last.key]);
    await phone.peer.db.run(
      'UPDATE sync_group_metadata SET updated_at = ? WHERE key = ?',
      ['9999-01-01T00:00:00.000Z', `${scope.key}:attachment:${last.key}`]);
    const requestSend = vi.fn();
    expect(await fixture.sync(phone, undefined, { requestSend })).toMatchObject({ published: 0, attachmentsPending: true });
    expect(requestSend).toHaveBeenCalledOnce();
    expect(await fixture.sync(phone)).toMatchObject({ published: 1, attachmentsPending: false });
    await enqueueWebDavRelayAttachments(phone.peer.db, scope, [storageKey(Buffer.from('Missing attachment'))]);
    requestSend.mockClear();
    expect(await fixture.sync(phone, undefined, { requestSend })).toMatchObject({ published: 0, attachmentsPending: true });
    expect(requestSend).not.toHaveBeenCalled();

    await fixture.sync(mac);
    expect(await readFile(path.join(mac.assets, last.key))).toEqual(last.bytes);
  } finally { await fixture.close(); }
});
