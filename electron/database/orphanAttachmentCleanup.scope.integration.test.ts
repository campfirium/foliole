// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { seedNode } from './nodeMutations.test.helpers.js';
import {
  cleanupAttachmentsAfterDelete, cleanupOrphanAttachments, createAttachmentCleanupPlan
} from './orphanAttachmentCleanup.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';

const hash = (character: string) => character.repeat(64);
const key = (character: string) => `${hash(character)}.png`;
const candidate = (character: string) => ({ id: hash(character), mime_type: 'image/png' });
const reference = (storageKey: string) => JSON.stringify([{ role: 'reference', storage_key: storageKey, original_name: null }]);

function setNode(nodeId: string, content: string, references = '[]') {
  seedNode(nodeId, null, 0);
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ?, resource_references = ? WHERE id = ?',
    [content, references, nodeId]);
}

function seedUnrelatedReferences(count: number) {
  for (let index = 0; index < count; index += 1) {
    setNode(`filler-${index}`, `![Other](asset://${key('b')})`, reference(key('c')));
  }
}

async function writeAssets(characters: string[]) {
  const { assetsDir } = resolveRuntimeDataPaths();
  await fs.mkdir(assetsDir, { recursive: true });
  for (const character of characters) await fs.writeFile(path.join(assetsDir, key(character)), 'image');
}

async function remainingAssets(characters: string[]) {
  const { assetsDir } = resolveRuntimeDataPaths();
  const present = await Promise.all(characters.map((character) =>
    fs.stat(path.join(assetsDir, key(character))).then(() => character, () => null)));
  return present.filter(Boolean);
}

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-orphan-scope-'));
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

it.each([10, 40])('reads holders of the deleted attachment only, not every unrelated reference (%s unrelated)', async (count) => {
  setNode('deleted', `![Kept](asset://${key('a')})`);
  setNode('holder', `![Kept](asset://${key('a')})`);
  seedUnrelatedReferences(count);
  const { driver } = openDatabaseConnection();
  const plan = await measureSqlStatements(() => createAttachmentCleanupPlan(['deleted']));
  expect(plan.result.candidates).toEqual([candidate('a')]);
  expect(plan.result.retainedKeys).toContain(key('a'));
  const after = await measureSqlStatements(() => cleanupAttachmentsAfterDelete(driver, [candidate('a')]));
  // The deleted node plus one other holder; unrelated references must not be returned.
  expect(plan.report.rowsRead).toBeLessThanOrEqual(2);
  expect(after.report.rowsRead).toBeLessThanOrEqual(2);
});

it('keeps every attachment still named by another node, however the reference is spelled', async () => {
  const kept = ['a', 'd', 'e', 'f', '1'];
  await writeAssets([...kept, '2']);
  setNode('literal', `![Kept](asset://${key('a')})`);
  setNode('percent', `![Kept](asset://%64${hash('d').slice(1)}.png)`);
  setNode('angle', `Intro\n\n![Kept][image]\n\n[image]: <asset:// ${key('e')}>`);
  openDatabaseConnection().driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?',
    [`[{"role":"reference","storage_key":"\\u0066${hash('f').slice(1)}.png","original_name":null}]`, 'angle']);
  setNode('json', 'Plain text', reference(key('1')));
  setNode('image-role', 'Plain text', JSON.stringify([{ role: 'image', storage_key: key('2'), original_name: null }]));
  seedUnrelatedReferences(5);
  const candidates = [...kept, '2'].map(candidate);

  const plan = createAttachmentCleanupPlan(['image-role']);
  expect(plan.candidates).toEqual([]);
  cleanupAttachmentsAfterDelete(openDatabaseConnection().driver, candidates);
  expect(await remainingAssets([...kept, '2'])).toEqual(kept);

  setNode('deleted', ['a', 'd', 'e', 'f', '1', '3'].map((character) => `![x](asset://${key(character)})`).join('\n'));
  const scoped = createAttachmentCleanupPlan(['deleted']);
  expect(kept.map(key).every((storageKey) => scoped.retainedKeys.includes(storageKey))).toBe(true);
  expect(cleanupOrphanAttachments(openDatabaseConnection().driver, scoped)).toEqual([candidate('3')]);
});
