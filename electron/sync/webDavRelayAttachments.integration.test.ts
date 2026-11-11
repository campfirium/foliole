// @vitest-environment node
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';
import { WEB_DAV_ATTACHMENT_MIB, type WebDavAttachmentPolicy } from '../../lib/platform/webDavRelayContract.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

const policies = [
  { mode: 'off' }, { mode: 'limited', max_mib: 1 }, { mode: 'unlimited' }
] as const satisfies readonly WebDavAttachmentPolicy[];

describeAttachmentPolicy(0);
describeAttachmentPolicy(1);

function describeAttachmentPolicy(sender: 0 | 1) {
  it.each(policies)('applies $mode to WebDAV attachments from peer ' + sender + ' and delivers skipped files over LAN', async policy => {
    const fixture = await relayFixture(policy);
    try {
      const source = fixture.peers[sender];
      const target = fixture.peers[sender === 0 ? 1 : 0];
      const files = [
        { bytes: Buffer.alloc(WEB_DAV_ATTACHMENT_MIB, 0x71), relayed: policy.mode !== 'off' },
        { bytes: Buffer.alloc(WEB_DAV_ATTACHMENT_MIB + 1, 0x72), relayed: policy.mode === 'unlimited' }
      ].map(file => ({ ...file, key: storageKey(file.bytes) }));
      for (const { key, bytes } of files) await writeFile(path.join(source.assets, key), bytes);
      await edit(source.peer, files.map(file => file.key), 'changed');
      await fixture.sync(source);
      expect(fixture.attachmentReads).toEqual([]);
      await fixture.sync(target);
      expect(fixture.uploads).toHaveLength(files.filter(file => file.relayed).length);
      const content = target.peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('changed');
      for (const { key, bytes, relayed } of files) {
        expect(content).toContain(key);
        const asset = path.join(target.assets, key);
        if (relayed) expect(await readFile(asset)).toEqual(bytes);
        else await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
      }

      expect(await fixture.lan()).toMatchObject({ complete: true });
      await target.reopen();
      for (const { key, bytes } of files) {
        expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
        expect(await readFile(path.join(source.assets, key))).toEqual(bytes);
      }
    } finally { await fixture.close(); }
  });
}

it.each(['desktop', 'phone'])('relays a new attachment from %s with an interrupted download and a verified restart', async sender => {
  const fixture = await relayFixture();
  try {
    const [mac, phone] = fixture.peers;
    const [source, target] = sender === 'desktop' ? [mac, phone] : [phone, mac];
    const original = await readFile(path.join(target.assets, fixture.old));
    const bytes = Buffer.alloc(ATTACHMENT_BLOCK_BYTES * 2 + 13, 0x71);
    const key = storageKey(bytes);
    await edit(source.peer, [fixture.old, key], 'changed');
    await fixture.sync(source);
    await fixture.sync(target);
    expect(fixture.uploads).toHaveLength(0);
    expect(target.peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('changed')).toContain(key);
    const asset = path.join(target.assets, key);
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(path.join(source.assets, key), bytes);
    source.peer.reopen();
    fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(source)).rejects.toThrow('lost_attachment_publication_response');
    expect(fixture.uploads).toHaveLength(1);
    source.peer.reopen();
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(1);
    expect(fixture.attachmentReads).toEqual([]);
    await expect(fixture.sync(target, interruptAttachment)).rejects.toThrow('interrupted_attachment');
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    await target.reopen();
    await expect(fixture.sync(target, corruptAttachment)).rejects.toThrow();
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    await fixture.sync(target);
    expect(fixture.uploads).toHaveLength(1);
    await target.reopen();
    expect(await readFile(asset)).toEqual(bytes);
    expect(await readFile(path.join(target.assets, fixture.old))).toEqual(original);
    expect(await fixture.sync(target)).toMatchObject({ applied: 0, published: 0 });
  } finally { await fixture.close(); }
});

it.each([
  ['interrupt', 'test_attachment_put_interrupted'],
  ['short', 'webdav_relay_stage_mismatch']
] as const)('retains the attachment after a %s PUT and delivers it after reopening', async (fault, error) => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.alloc(ATTACHMENT_BLOCK_BYTES + 13, 0x74);
    const key = storageKey(bytes);
    await writeFile(path.join(source.assets, key), bytes);
    await edit(source.peer, [key], 'changed');
    fixture.faultNextAttachmentPut(fault);
    await expect(fixture.sync(source)).rejects.toThrow(error);
    await fixture.sync(target);
    const asset = path.join(target.assets, key);
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    await source.reopen();
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(2);
    expect(new Set(fixture.uploads).size).toBe(1);
    expect(fixture.attachmentReads).toEqual([]);
    await fixture.sync(target);
    expect(await readFile(asset)).toEqual(bytes);
  } finally { await fixture.close(); }
});

it('preserves a conflicting final packet and leaves its attachment eligible for LAN recovery', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.alloc(ATTACHMENT_BLOCK_BYTES + 13, 0x76);
    const key = storageKey(bytes);
    await writeFile(path.join(source.assets, key), bytes);
    await edit(source.peer, [key], 'changed');
    fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(source)).rejects.toThrow('lost_attachment_publication_response');
    const final = new URL(fixture.uploads[0]!.replace(/\.partial$/u, ''));
    const broken = Buffer.from('truncated ciphertext');
    await fixture.request(final, { method: 'PUT', body: { bytes: broken.length, async *chunks() { yield broken; } } }, webDavRelayStatus);
    await source.reopen();
    await expect(fixture.sync(source)).rejects.toThrow('webdav_relay_destination_conflict');
    expect(fixture.uploads).toHaveLength(1);
    expect(fixture.attachmentReads).toEqual([]);
    await expect(fixture.sync(target)).rejects.toThrow();
    const asset = path.join(target.assets, key);
    await expect(stat(asset)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fixture.lan()).toMatchObject({ complete: true });
    await target.reopen();
    expect(await readFile(asset)).toEqual(bytes);
  } finally { await fixture.close(); }
});

async function* interruptAttachment(body: AsyncIterable<Uint8Array>) {
  let bytes = 0;
  for await (const chunk of body) {
    yield chunk;
    bytes += chunk.length;
    if (bytes > ATTACHMENT_BLOCK_BYTES + 4096) throw new Error('interrupted_attachment');
  }
}

async function* corruptAttachment(body: AsyncIterable<Uint8Array>) {
  let last: Uint8Array | undefined;
  for await (const chunk of body) {
    if (last) yield last;
    last = chunk;
  }
  if (last) {
    const corrupt = Uint8Array.from(last);
    const index = corrupt.length - 1;
    corrupt[index] = corrupt[index]! ^ 1;
    yield corrupt;
  }
}
