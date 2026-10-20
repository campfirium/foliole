// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { loadCompanionNodeDocument } from '../../../../../../lib/core/database/companionNodeDocumentRead.js';
import { WORKSPACE_BODY_STATUS_SQL } from '../../../../../../lib/core/database/workspaceBodyStatus.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });
const nodeId = 't343-current-body-recovery';
const body = '\ufeffOriginal中文😀\0body\r\n';

async function setup() {
  host = await createCompanionRequestFixture();
  await host.fixture.right.seed({ content: body, nodeId, title: 'Original' });
  await host.sync();
  return host;
}

function identities(fixture: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  return {
    node: fixture.sqlite.prepare('SELECT id, current_version_id, body_blob_hash FROM nodes WHERE id = ?').get(nodeId),
    versions: fixture.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, content_hash,
      host_name, created_at FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all(nodeId),
    parents: fixture.sqlite.prepare(`SELECT * FROM node_sync_version_parents WHERE version_id IN
      (SELECT version_id FROM node_sync_versions WHERE object_id = ?) ORDER BY version_id, ordinal`).all(nodeId)
  };
}

it('repairs a missing current body from a complete peer with the same version and preserves identities after reopening', async () => {
  const fixture = await setup();
  const original = identities(fixture);
  fixture.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_deleted', json('false'))
    WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).run(nodeId);
  fixture.sqlite.prepare("UPDATE nodes SET content = '' WHERE id = ?").run(nodeId);
  expect(identities(fixture)).toEqual(original);
  expect(await readFramedSyncInventoryEntry(fixture.db, { objectType: 'node', globalId: nodeId }))
    .toMatchObject({ unready: true });
  expect(await fixture.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(identities(fixture)).toEqual(original);
  expect.soft(await loadCompanionNodeDocument(fixture.db, nodeId)).toMatchObject({ content: body, content_status: 'ready' });
  expect(fixture.sqlite.prepare(`SELECT body_text FROM node_sync_versions
    WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).pluck().get(nodeId)).toBe(body);
  expect(await readFramedSyncInventoryEntry(fixture.db, { objectType: 'node', globalId: nodeId }))
    .toMatchObject({ unready: false });
  await fixture.restart();
  expect(identities(fixture)).toEqual(original);
  expect.soft(await loadCompanionNodeDocument(fixture.db, nodeId)).toMatchObject({ content: body, content_status: 'ready' });
}, 30000);

it('reports an empty current projection as empty rather than missing when its version still owns the complete body', async () => {
  const fixture = await setup();
  const original = identities(fixture);
  fixture.sqlite.prepare("UPDATE nodes SET content = '' WHERE id = ?").run(nodeId);
  expect(fixture.sqlite.prepare(`SELECT body_text FROM node_sync_versions
    WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).pluck().get(nodeId)).toBe(body);
  expect(await loadCompanionNodeDocument(fixture.db, nodeId)).toMatchObject({ content: '', content_status: 'empty' });
  expect(fixture.sqlite.prepare(`SELECT ${WORKSPACE_BODY_STATUS_SQL} AS body_status FROM nodes n WHERE id = ?`)
    .get(nodeId)).toEqual({ body_status: 'empty' });
  expect(await readFramedSyncInventoryEntry(fixture.db, { objectType: 'node', globalId: nodeId }))
    .toMatchObject({ unready: false });
  expect(identities(fixture)).toEqual(original);
}, 30000);
