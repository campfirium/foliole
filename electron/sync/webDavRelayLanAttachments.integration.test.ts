// @vitest-environment node
import { readFile, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

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

it('honors repair demand for an older attachment previously marked done by the time heuristic', async () => {
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

    await source.reopen();
    await fixture.sync(source);
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, fixture.old))).toEqual(await readFile(path.join(source.assets, fixture.old)));
    expect(fixture.uploads).toHaveLength(1);
  } finally { await fixture.close(); }
});
