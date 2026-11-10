// @vitest-environment node
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

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
