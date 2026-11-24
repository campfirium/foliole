// @vitest-environment node
import { readFile, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { readWebDavRelayRepair } from '../../lib/core/sync/webDavRelayRepairWire.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';
import { webDavTestGroupKey } from './webDavRelayLan.testSupport.js';

it('delivers an old image after the initial LAN database round left its transfer pending', async () => {
  const fixture = await relayFixture({ mode: 'unlimited' }, { unavailableBaselineAttachment: true });
  try {
    const [source, target] = fixture.peers;
    const file = path.join(source.assets, fixture.old);
    const received = path.join(target.assets, fixture.old);
    expect((await stat(file)).mtimeMs).toBeLessThan((await fixture.scope(source.peer))!.baseline.capturedAt);
    await expect(stat(received)).rejects.toMatchObject({ code: 'ENOENT' });
    const existing = (await loadCurrentSyncNodeRecord(source.peer.db, 'baseline'))!;
    expect(await loadCurrentSyncNodeRecord(target.peer.db, 'baseline')).toMatchObject({ body_text: existing.body_text });
    const body = existing.body_text + '\n\nEdited after LAN.';
    const update = textBranch('baseline-after-lan', body, existing);
    await applySyncNodesWithDbPort(source.peer.db, [{ ...update, object_id: 'baseline',
      snapshot: { ...update.snapshot, id: 'baseline' } }], { operation: 'local_mutation' });

    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await loadCurrentSyncNodeRecord(target.peer.db, 'baseline')).toMatchObject({ body_text: body });
    expect(await readFile(received)).toEqual(await readFile(file));
    expect(fixture.uploads).toHaveLength(1);
    await fixture.sync(source);
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it('repairs an image left pending by the initial LAN round without another body edit', async () => {
  const fixture = await relayFixture({ mode: 'unlimited' }, { unavailableBaselineAttachment: true });
  try {
    const [source, target] = fixture.peers;
    const received = path.join(target.assets, fixture.old);
    expect(await loadCurrentSyncNodeRecord(target.peer.db, 'baseline')).toMatchObject({
      body_text: (await loadCurrentSyncNodeRecord(source.peer.db, 'baseline'))!.body_text
    });
    await expect(stat(received)).rejects.toMatchObject({ code: 'ENOENT' });

    const { key } = (await fixture.scope(source.peer))!;
    expect(await source.peer.db.query('SELECT value FROM sync_group_metadata WHERE key = ?',
      [`${key}:attachment:${fixture.old}`])).toEqual([]);
    await target.reopen();
    await publishRepairBeforeBody(fixture);
    await source.reopen();
    expect(await fixture.sync(source)).toMatchObject({ published: 1 });
    await fixture.sync(target);
    await target.reopen();

    expect(await readFile(received)).toEqual(await readFile(path.join(source.assets, fixture.old)));
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it('delivers a newly referenced old file despite the completed LAN attachment round', async () => {
  const fixture = await relayFixture({ mode: 'unlimited' });
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('An old file first referenced after LAN');
    const key = storageKey(bytes);
    const file = path.join(source.assets, key);
    await writeFile(file, bytes);
    await utimes(file, 100, 100);
    await edit(source.peer, [fixture.old, key], 'after-lan');

    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
    expect(await readFile(path.join(target.assets, fixture.old))).toEqual(await readFile(path.join(source.assets, fixture.old)));
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it.each([false, true])('repairs an attachment marked done by the old heuristic with a prior request=%s', async requested => {
  const fixture = await relayFixture({ mode: 'unlimited' }, { unavailableBaselineAttachment: true });
  try {
    const [source, target] = fixture.peers;
    const scope = (await fixture.scope(source.peer))!;
    await source.peer.db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, 'done', ?)`,
      [`${scope.key}:attachment:${fixture.old}`, new Date().toISOString()]);
    await edit(source.peer, [fixture.old], 'referenced-legacy-attachment');
    await fixture.sync(source);
    await expect(stat(path.join(target.assets, fixture.old))).rejects.toMatchObject({ code: 'ENOENT' });
    await fixture.sync(target);
    expect(fixture.repairUploads).toHaveLength(1);
    if (requested) {
      await preserveOldRepairState(fixture);
      await target.reopen();
      await fixture.sync(target);
      expect(fixture.repairUploads).toHaveLength(2);
      await fixture.sync(target);
      expect(fixture.repairUploads).toHaveLength(2);
    }

    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, fixture.old))).toEqual(await readFile(path.join(source.assets, fixture.old)));
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

it('recovers a request acknowledged by the old sender after the receiver had already upgraded', async () => {
  const fixture = await relayFixture({ mode: 'unlimited' }, { unavailableBaselineAttachment: true });
  try {
    const [source, target] = fixture.peers;
    const { key } = (await fixture.scope(source.peer))!;
    await source.peer.db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, 'done', ?)`,
      [`${key}:attachment:${fixture.old}`, new Date().toISOString()]);
    const received = path.join(target.assets, fixture.old);
    await publishRepairBeforeBody(fixture);
    await acknowledgeAsOldSender(fixture);
    await expect(stat(received)).rejects.toMatchObject({ code: 'ENOENT' });

    await target.reopen();
    await publishRepairBeforeBody(fixture);
    await source.reopen();
    expect(await fixture.sync(source)).toMatchObject({ published: 1 });
    expect(await fixture.sync(source)).toMatchObject({ published: 0 });
    await fixture.sync(target);
    await target.reopen();

    expect(await readFile(received)).toEqual(await readFile(path.join(source.assets, fixture.old)));
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});

async function publishRepairBeforeBody(fixture: Awaited<ReturnType<typeof relayFixture>>) {
  // The next body packet may echo the LAN-applied node. Let the source see the repair first.
  fixture.delayNextBodyMove();
  await expect(fixture.sync(fixture.peers[1])).rejects.toThrow('test_body_move_delayed');
  expect(fixture.repairUploads).toHaveLength(1);
}

async function preserveOldRepairState(fixture: Awaited<ReturnType<typeof relayFixture>>) {
  await acknowledgeAsOldSender(fixture);
  const target = fixture.peers[1];
  const targetScope = (await fixture.scope(target.peer))!;
  await target.peer.db.run("UPDATE sync_group_metadata SET value = json_set(value, '$.policy', ?) WHERE key = ?",
    [JSON.stringify(targetScope.attachmentPolicy), `${targetScope.key}:repair-outbox`]);
}

async function acknowledgeAsOldSender(fixture: Awaited<ReturnType<typeof relayFixture>>) {
  const [source] = fixture.peers;
  const sourceScope = (await fixture.scope(source.peer))!;
  const packet = new URL(fixture.repairUploads[0]!.replace(/\.partial$/u, ''));
  const id = (await fixture.request(packet, { method: 'GET' }, (_status, body) =>
    readWebDavRelayRepair({ scope: sourceScope, groupKey: webDavTestGroupKey }, body))).id;
  const name = path.posix.basename(packet.pathname);
  // The old sender confirmed the repair packet but erroneously kept the attachment marked done.
  await source.peer.db.run(`INSERT INTO sync_group_metadata (key, value, updated_at)
    VALUES (?, 'true', ?), (?, 'true', ?)`,
  [`${sourceScope.key}:applied:${name}`, new Date().toISOString(),
    `${sourceScope.key}:repair-received:${id}`, new Date().toISOString()]);
}
