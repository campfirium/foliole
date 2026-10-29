// @vitest-environment node
import { expect, it } from 'vitest';

import { readAttachmentReferenceInputs, saveAttachmentReferenceResults } from '../../lib/core/attachments/attachmentReferenceCache.js';
import { parseAttachmentReferenceInput } from '../../lib/core/attachments/attachmentReferenceInputs.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { restoreFixture, transfer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

it('keeps the local observation cache outside request sync and preserves image and PDF demands after reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const image = `${'a'.repeat(64)}.png`;
  const pdf = `${'b'.repeat(64)}.pdf`;
  const body = `![image](asset://${image})`;
  try {
    const record = textBranch('article-with-resources', body);
    record.snapshot.resource_references = JSON.stringify([{ storage_key: pdf, role: 'reference', original_name: 'document.pdf' }]);
    await applyConvergentSyncNodesWithDbPort(source.db, [record]);
    const inventory = await readRequestSyncInventorySnapshot(source.db);
    const inputs = await readAttachmentReferenceInputs(source.db, null);
    await saveAttachmentReferenceResults(source.db, inputs.map(parseAttachmentReferenceInput));
    expect(await readRequestSyncInventorySnapshot(source.db)).toEqual(inventory);
    const differences = compareFramedSyncInventories({ local: inventory, remote: await readRequestSyncInventorySnapshot(target.db) });
    for (const difference of differences.filter(row => row.objectType === 'node')) {
      await transfer(source, target, { groupId: 'group', overwriteId: 'ordinary', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
    }
    source.reopen(); target.reopen();
    expect(source.sqlite.prepare('SELECT count(*) FROM attachment_reference_cache').pluck().get()).toBe(1);
    expect(target.sqlite.prepare('SELECT * FROM attachment_reference_cache').all()).toEqual([]);
    for (const peer of [source, target]) {
      expect(peer.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe(body);
      const needed = await readRequestSyncAttachmentNeedsSlice(peer.host, async keys => keys.map(() => false), () => false);
      expect(needed.keys.sort()).toEqual([image, pdf]);
    }
  } finally { await fixture.close(); }
});
