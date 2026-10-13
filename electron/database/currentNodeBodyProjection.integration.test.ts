// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { reconcileCurrentNodeBody } from '../../lib/core/sync/currentNodeBodyProjection.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const device of devices.splice(0)) device.sqlite.close(); });
const body = '\ufeffOwned中文😀\0body\r\n';

async function fixture() {
  const device = textDevice(); devices.push(device);
  const base = textBranch('base', 'Original');
  await device.receive([base, textBranch('current', body, base)]);
  return device;
}

function facts(device: ReturnType<typeof textDevice>) {
  return ['node_sync_versions', 'node_sync_version_parents', 'sync_object_state']
    .map(table => device.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

it.each([
  { name: 'dirty local content', content: 'Unsaved local body', dirty: 1, hash: hashTextBody(body) },
  { name: 'nonempty local content without an owned hash', content: 'Local body without ownership', dirty: 0, hash: null },
  { name: 'content with a different owned hash', content: 'Another owned body', dirty: 0, hash: hashTextBody('Another owned body') }
])('does not replace $name from the retained version', async ({ content, dirty, hash }) => {
  const device = await fixture();
  device.sqlite.prepare('UPDATE nodes SET content = ?, sync_dirty = ?, body_blob_hash = ? WHERE id = ?')
    .run(content, dirty, hash, 'topic');
  const before = device.sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('topic');
  const originalFacts = facts(device);
  await device.db.transaction(tx => reconcileCurrentNodeBody(tx, 'topic', false));
  expect(device.sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('topic')).toEqual(before);
  expect(facts(device)).toEqual(originalFacts);
});

it('restores the clean current body without changing deletion state or immutable facts', async () => {
  const device = await fixture();
  device.sqlite.exec("UPDATE nodes SET content = '', body_blob_hash = NULL, sync_dirty = 0, deleted_at = '2026-10-13' WHERE id = 'topic'");
  const before = device.sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('topic');
  const originalFacts = facts(device);
  await device.db.transaction(tx => reconcileCurrentNodeBody(tx, 'topic', false));
  const restored = device.sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('topic');
  expect(restored).toEqual({ ...before as Record<string, unknown>, content: body, body_blob_hash: hashTextBody(body) });
  expect(facts(device)).toEqual(originalFacts);
  await device.db.transaction(tx => reconcileCurrentNodeBody(tx, 'topic', false));
  expect(device.sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get('topic')).toEqual(restored);
  expect(facts(device)).toEqual(originalFacts);
});
