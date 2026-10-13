// @vitest-environment node
import { expect, it } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { sendCurrentObject } from './currentRequestLearning.testSupport.js';

it('materializes original PDF attachment links for a node first learned through a current request', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const record = textBranch('original', 'Original body');
    record.snapshot.resource_references = JSON.stringify([{ storage_key: `${'a'.repeat(64)}.pdf`,
      original_name: 'Original.pdf', role: 'reference' }]);
    await applySyncNodesWithDbPort(source.db, [record]);
    expect(target.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
    for (let replay = 0; replay < 2; replay++) {
      await sendCurrentObject(source, target); target.reopen();
      expect(target.sqlite.prepare(`SELECT nodes.id AS node_id,
        json_extract(resource.value, '$.storage_key') AS storage_key,
        json_extract(resource.value, '$.original_name') AS original_name,
        json_extract(resource.value, '$.role') AS role
        FROM nodes, json_each(nodes.resource_references) resource WHERE nodes.id = 'topic'`).all())
        .toEqual([{ node_id: 'topic', storage_key: `${'a'.repeat(64)}.pdf`, original_name: 'Original.pdf', role: 'reference' }]);
      expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get())
        .toEqual({ content: 'Original body', current_version_id: 'original' });
    }
  } finally { await fixture.close(); }
});
