// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

it.each([
  { scenario: 'continuous edits', desktop: false },
  { scenario: 'unavailable object', desktop: false },
  { scenario: 'unavailable object', desktop: true }
])('finishes an attachment despite $scenario with desktop initiator=$desktop', async ({ scenario, desktop }) => {
  const host = await createCompanionRequestFixture();
  const bytes = Buffer.alloc(2 * ATTACHMENT_BLOCK_BYTES + 19, 0x61);
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const nodeId = 't326-fairness-edit';
  try {
    await host.fixture.left.seed({ nodeId: 't326-attachment', title: 'Image', content: `![image](asset://${key})` });
    await host.fixture.right.seed({ nodeId, title: 'Editing', content: 'Initial' });
    await host.sync();
    const assets = path.join(host.fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets');
    await mkdir(assets, { recursive: true });
    await writeFile(path.join(assets, key), bytes);
    await host.fixture.right.seed({ nodeId, title: 'Editing', content: 'New unavailable or moving version' });
    if (scenario === 'unavailable object') {
      const source = new Database(host.fixture.rightSnapshot.databasePath);
      try {
        source.prepare(`UPDATE node_sync_versions SET body_text = NULL,
          snapshot_json = json_set(snapshot_json, '$.content', NULL)
          WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).run(nodeId);
      } finally { source.close(); }
    }
    let edit = 0;
    native.post.mockImplementation(async input => {
      const response = await host.post(input);
      if (scenario === 'continuous edits' && new URL(input.url).searchParams.get('request') === 'pulls') {
        await host.fixture.right.seed({ nodeId, title: 'Editing', content: `Still editing ${++edit}` });
      }
      return response;
    });
    const release = waitForAttachmentWorkYield();
    try {
      for (let round = 0; round < 3; round++) {
        if (desktop) {
          expect(await host.fixture.left.synchronize(host.fixture.rightSnapshot.origin))
            .toMatchObject({ complete: false, attachmentProgress: 1 });
        } else {
          const result = await host.sync();
          expect(result.remainingStructureChangeCount).toBeGreaterThan(0);
          expect(result.databaseConfirmedAt).toBeUndefined();
          expect(result.transferredAttachmentBlockCount).toBe(1);
        }
      }
      const target = path.join(host.fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', key);
      expect(await readFile(target)).toEqual(bytes);
      if (scenario === 'continuous edits') expect(edit).toBeGreaterThanOrEqual(12);
    } finally { release(); }
  } finally { await host.close(); }
}, 60_000);
