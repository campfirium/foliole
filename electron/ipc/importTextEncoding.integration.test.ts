// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runImportForFilePath } from './importTextFile.js';

let root = '';
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-text-encoding-'));
  await initializeDatabase(undefined, { recovery: 'fail' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

async function importBytes(bytes: Buffer) {
  const file = path.join(root, 'article.txt');
  await fs.writeFile(file, bytes);
  const result = await runImportForFilePath(file);
  expect(await fs.readFile(file)).toEqual(bytes);
  return result;
}

const text = 'First 中文 😀\r\nSecond line\r\nLiteral replacement character: \ufffd';
const expected = text.replace(/\r\n/g, '\n');
const le = Buffer.from('\ufeff' + text, 'utf16le');
const legacyLine = '这是用于文本导入的完整中文内容。编码识别应保留每一个字符，不产生乱码，也不截断原文。\r\n';
const legacyBytes = Buffer.from('d5e2cac7d3c3d3dacec4b1beb5bcc8ebb5c4cdead5fbd6d0cec4c4dac8dda1a3b1e0c2ebcab6b1f0d3a6b1a3c1f4c3bfd2bbb8f6d7d6b7fba3acb2bbb2fac9fac2d2c2eba3acd2b2b2bbbdd8b6cfd4adcec4a1a30d0a', 'hex');

it('automatically decodes a complete GB18030 source before persisting it', async () => {
  const result = await importBytes(Buffer.concat(Array.from({ length: 20 }, () => legacyBytes)));
  expect(result.result_status).toBe('imported');
  if (!result.node_id) throw new Error('import_node_missing');
  const expectedBody = legacyLine.repeat(20).replace(/\r\n/g, '\n');
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result.node_id))
    .toMatchObject({ content: expectedBody });
});

it('automatically decodes Big5 without replacing traditional Chinese characters', async () => {
  const line = '這是完整的繁體中文內容，匯入時應保留全部文字，正確判斷編碼，不產生亂碼，也不截斷原文。\r\n';
  const bytes = Buffer.from('b36fac4fa7b9bee3aabac163c5e9a4a4a4e5a4baae65a141b6d7a44aaec9c0b3ab4faf64a5feb3a1a4e5a672a141a5bfbd54a750c25fbd73bd58a141a4a3b2a3a5cdb6c3bd58a141a45da4a3ba49c25fadeca4e5a1430d0a', 'hex');
  const result = await importBytes(Buffer.concat(Array.from({ length: 20 }, () => bytes)));
  if (!result.node_id) throw new Error('import_node_missing');
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result.node_id))
    .toMatchObject({ content: line.repeat(20).replace(/\r\n/g, '\n') });
});

it.each([
  ['UTF-8', Buffer.from(text)],
  ['UTF-8 BOM', Buffer.from('\ufeff' + text)],
  ['UTF-16 LE BOM', le],
  ['UTF-16 BE BOM', Buffer.from(le).swap16()]
])('imports complete %s text through the file and persistence path', async (_name, bytes) => {
  if (!Buffer.isBuffer(bytes)) throw new Error('fixture_bytes_missing');
  const result = await importBytes(bytes);
  expect(result.result_status).toBe('imported');
  if (!result.node_id) throw new Error('import_node_missing');
  const driver = openDatabaseConnection().driver;
  expect(loadNodeBodyResolution(driver, result.node_id)).toMatchObject({ content: expected });
  const stored = driver.queryOne<{ bytes: number }>(
    'SELECT length(CAST(content AS BLOB)) AS bytes FROM nodes WHERE id = ?',
    [result.node_id]
  );
  expect(stored?.bytes).toBe(Buffer.byteLength(expected));
});

it('removes only the file BOM and preserves a leading content BOM', async () => {
  const body = '\ufeff' + text;
  const result = await importBytes(Buffer.from('\ufeff' + body));
  if (!result.node_id) throw new Error('import_node_missing');
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result.node_id))
    .toMatchObject({ content: body.replace(/\r\n/g, '\n') });
});

it.each([
  ['GBK without BOM', Buffer.from([0x3d, 0x3d, 0xb1, 0xbe, 0xce, 0xc4])],
  ['truncated UTF-8', Buffer.from([0xef, 0xbb, 0xbf, 0xe4, 0xb8])],
  ['truncated UTF-16', Buffer.from([0xff, 0xfe, 0x2d])],
  ['unpaired UTF-16 surrogate', Buffer.from([0xff, 0xfe, 0x00, 0xd8])],
  ['UTF-32 BOM', Buffer.from([0xff, 0xfe, 0, 0, 0x41, 0, 0, 0])]
])('rejects %s with recovery guidance before creating a topic', async (_name, bytes) => {
  if (!Buffer.isBuffer(bytes)) throw new Error('fixture_bytes_missing');
  const driver = openDatabaseConnection().driver;
  const before = driver.queryAll('SELECT * FROM nodes');
  const result = await importBytes(bytes);
  expect(result).toMatchObject({ result_status: 'failed', node_id: null });
  expect(result.failure_reason).toContain('Save a copy as UTF-8');
  expect(driver.queryAll('SELECT * FROM nodes')).toEqual(before);
});

it('preserves a source larger than five megabytes without truncation or replacement', async () => {
  const body = 'Complete 中文 😀 line\r\n'.repeat(200_000);
  const bytes = Buffer.from(body);
  expect(bytes.length).toBeGreaterThan(5_000_000);
  const result = await importBytes(bytes);
  if (!result.node_id) throw new Error('import_node_missing');
  const driver = openDatabaseConnection().driver;
  const parts = readBodyPartIds(driver, result.node_id);
  expect(parts.length).toBeGreaterThan(1);
  expect(readPartitionedNodeBody(driver, result.node_id)).toBe(body.replace(/\r\n/g, '\n'));
  for (const id of [result.node_id, ...parts]) {
    const persisted = loadNodeBodyResolution(driver, id);
    if (!persisted) throw new Error('import_body_part_missing');
    expect(Buffer.byteLength(persisted.content)).toBeLessThanOrEqual(1048576);
    expect(persisted.content).not.toContain('\ufffd');
  }
}, 20_000);
