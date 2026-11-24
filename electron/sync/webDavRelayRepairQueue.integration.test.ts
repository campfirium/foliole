// @vitest-environment node
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

it('delivers a healthy attachment past a full repair batch and retries a restored file', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const unavailable = Array.from({ length: 64 }, (_, index) => {
      const bytes = Buffer.from(`Published file ${index}`);
      return { bytes, key: storageKey(bytes) };
    });
    await Promise.all(unavailable.map(({ key, bytes }) => writeFile(path.join(source.assets, key), bytes)));
    await edit(source.peer, unavailable.map(file => file.key), 'damaged-remote');
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(64);
    await Promise.all(unavailable.map(({ key }) => rm(path.join(source.assets, key))));

    expect(await fixture.sync(target, async function* (body) {
      // Simulate a relay returning damaged copies of the previously published files.
      const reader = body[Symbol.asyncIterator]();
      while (!(await reader.next()).done) { /* Drain the original response. */ }
      yield Buffer.from('damaged packet');
    })).toMatchObject({ retries: 64 });
    await fixture.sync(source);
    const { key } = (await fixture.scope(source.peer))!;
    const repairs = () => source.peer.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM sync_group_metadata WHERE key >= ? AND key < ? AND substr(value, 1, 1) = '{' ORDER BY key",
      [`${key}:attachment:`, `${key}:attachment;`]);
    const queued = await repairs();
    expect(queued).toHaveLength(64);

    const healthy = Buffer.from('Healthy file queued after the repair requests');
    const healthyKey = storageKey(healthy);
    await writeFile(path.join(source.assets, healthyKey), healthy);
    await edit(source.peer, [healthyKey], 'new-article');
    await fixture.sync(source);
    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(target.peer.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('new-article')).toContain(healthyKey);
    expect(fixture.uploads).toHaveLength(65);
    expect(await readFile(path.join(target.assets, healthyKey))).toEqual(healthy);
    expect(await repairs()).toEqual(queued);

    const recovered = unavailable[0]!;
    await writeFile(path.join(source.assets, recovered.key), recovered.bytes);
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, recovered.key))).toEqual(recovered.bytes);
    expect(await repairs()).toEqual(queued.filter(row => row.key !== `${key}:attachment:${recovered.key}`));
  } finally { await fixture.close(); }
}, 20_000);

it('delivers a healthy attachment while a requested source file is corrupt', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const original = Buffer.from('Original attachment bytes');
    const originalKey = storageKey(original);
    const sourceFile = path.join(source.assets, originalKey);
    const targetFile = path.join(target.assets, originalKey);
    await writeFile(sourceFile, original);
    await edit(source.peer, [originalKey], 'old-article');
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(1);
    await writeFile(sourceFile, Buffer.alloc(original.length, 42));

    expect(await fixture.sync(target, async function* (body) {
      const reader = body[Symbol.asyncIterator]();
      while (!(await reader.next()).done) { /* Drain the original response. */ }
      yield Buffer.from('damaged packet');
    })).toMatchObject({ retries: 1 });
    expect(fixture.repairUploads).toHaveLength(1);
    await expect(readFile(targetFile)).rejects.toMatchObject({ code: 'ENOENT' });

    const healthy = Buffer.from('Unrelated healthy attachment');
    const healthyKey = storageKey(healthy);
    await writeFile(path.join(source.assets, healthyKey), healthy);
    await edit(source.peer, [healthyKey], 'new-article');
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(2);
    await fixture.sync(target);
    expect(await readFile(path.join(target.assets, healthyKey))).toEqual(healthy);
    await expect(readFile(targetFile)).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(sourceFile, original);
    await source.reopen();
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(3);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(targetFile)).toEqual(original);
  } finally { await fixture.close(); }
});
