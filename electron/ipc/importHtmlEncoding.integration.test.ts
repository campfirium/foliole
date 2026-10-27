// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { runDirectoryImportBatch } from '../import/directoryImportBatch.js';

import { discoverDirectoryImportSources } from './importSourcePipeline.js';
import { runImportForFilePath } from './importTextFile.js';

let root = '';
vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: async (file: string) => fs.rename(file, path.join(root, 'trashed.html')) }
}));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

beforeEach(async () => {
  const artifacts = path.resolve('.tmp/artifacts/T514');
  await fs.mkdir(artifacts, { recursive: true });
  root = await fs.mkdtemp(path.join(artifacts, 'html-encoding-'));
  await initializeDatabase(undefined, { recovery: 'fail' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function htmlBytes(head: string, text: Buffer) {
  return Buffer.concat([Buffer.from(`<html><head>${head}</head><body><p>`), text, Buffer.from('</p></body></html>')]);
}

async function expectImported(bytes: Buffer, body: string) {
  const file = path.join(root, 'article.html');
  await fs.writeFile(file, bytes);
  const result = await runImportForFilePath(file);
  expect(result.result_status).toBe('imported');
  if (!result.node_id) throw new Error('import_node_missing');
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result.node_id)).toMatchObject({ content: body });
  expect(await fs.readFile(file)).toEqual(bytes);
}

it.each([
  ['GBK', 'd6d0cec4', '中文'],
  ['Big5', 'a4a4a4e5', '中文'],
  ['Shift_JIS', '93fa967b', '日本'],
  ['EUC-KR', 'c7d1b1b9', '한국'],
  ['windows-1252', '636166e9208097', 'café €—']
])('persists a declared %s page without replacing its text', async (encoding, hex, text) => {
  await expectImported(htmlBytes(`<META CHARSET='${encoding}'>`, Buffer.from(hex, 'hex')), text);
});

it('supports legacy content-type declarations regardless of attribute order', async () => {
  await expectImported(htmlBytes('<meta content="text/html; charset=Shift_JIS" HTTP-EQUIV="Content-Type">',
    Buffer.from('93fa967b', 'hex')), '日本');
});

it.each([
  ['UTF-8', Buffer.from('<meta charset=gbk><p>日本 한국 café 中文</p>')],
  ['UTF-16LE', Buffer.from('<meta charset=gbk><p>日本 한국 café 中文</p>', 'utf16le')],
  ['UTF-16BE', Buffer.from('<meta charset=gbk><p>日本 한국 café 中文</p>', 'utf16le').swap16()]
])('gives a %s BOM precedence over a conflicting declaration', async (encoding, content) => {
  const bom = encoding === 'UTF-8' ? Buffer.from([0xef, 0xbb, 0xbf])
    : Buffer.from(encoding === 'UTF-16LE' ? [0xff, 0xfe] : [0xfe, 0xff]);
  await expectImported(Buffer.concat([bom, content]), '日本 한국 café 中文');
});

it('keeps undeclared UTF-8 text and ignores declarations inside comments, script and template content', async () => {
  const head = '<!-- <meta charset=gbk> --><script>"<meta charset=big5>"</script><template><meta charset=gbk></template>';
  await expectImported(htmlBytes(head, Buffer.from('日本 한국 café 中文 �')), '日本 한국 café 中文 �');
});

it.each(['utf-16', 'utf-16be', 'utf-16le'])(
  'uses HTML UTF-8 semantics for the %s meta label without a BOM', async (label) => {
    await expectImported(htmlBytes(`<meta charset=${label}>`, Buffer.from('日本 한국 café 中文')), '日本 한국 café 中文');
  }
);

it('maps the HTML x-user-defined label to windows-1252', async () => {
  await expectImported(htmlBytes('<meta charset=x-user-defined>', Buffer.from('636166e9', 'hex')), 'café');
});

it('automatically identifies an undeclared non-UTF-8 article before persisting it', async () => {
  const text = 'これは日本語の文章です。文字コードを正しく判定して、すべての文章を読み込む必要があります。';
  const hex = '82b182ea82cd93fa967b8cea82cc95b68fcd82c582b7814295b68e9a8352815b836882f090b382b582ad94bb92e882b582c4814182b782d782c482cc95b68fcd82f093c782dd8d9e82de954b977682aa82a082e882dc82b78142';
  await expectImported(htmlBytes('', Buffer.concat(Array.from({ length: 20 }, () => Buffer.from(hex, 'hex')))), text.repeat(20));
});

it.each([
  ['unknown declaration', htmlBytes('<meta charset=not-an-encoding>', Buffer.from('Text'))],
  ['unsupported UTF-7', htmlBytes('<meta charset=utf-7>', Buffer.from('Text'))],
  ['truncated declared UTF-8', htmlBytes('<meta charset=utf-8>', Buffer.from([0xe4, 0xb8]))],
  ['invalid declared GBK', htmlBytes('<meta charset=gbk>', Buffer.from([0xff]))],
  ['truncated BOM UTF-16', Buffer.from([0xff, 0xfe, 0x3c])],
  ['ambiguous undeclared bytes', Buffer.from([0x3d, 0x3d, 0xb1, 0xbe, 0xce, 0xc4])]
])('records %s as failed, creates no topic and preserves source bytes', async (_name, bytes) => {
  const inbox = path.join(root, 'Inbox');
  await fs.mkdir(inbox);
  const file = path.join(inbox, 'article.html');
  await fs.writeFile(file, bytes);
  const driver = openDatabaseConnection().driver;
  const before = driver.queryAll('SELECT * FROM nodes');
  const result = await runDirectoryImportBatch({
    consumePolicy: 'clear', highlightPolicy: 'reference_only', rootPath: inbox,
    sourceAdapter: 'foliole_managed_inbox_folder', titleStrategy: 'file_name',
    sources: await discoverDirectoryImportSources(inbox)
  });
  expect(result).toMatchObject({ failed_count: 1, consumed_count: 0 });
  expect(result.entries[0]).toMatchObject({ result_status: 'failed', node_id: null });
  expect(result.entries[0]?.failure_reason).toContain('Save a copy as UTF-8');
  expect(driver.queryAll('SELECT * FROM nodes')).toEqual(before);
  expect(await fs.readFile(file)).toEqual(bytes);
});

it('finishes persisting the decoded page before consuming the successful source', async () => {
  const inbox = path.join(root, 'Inbox');
  await fs.mkdir(inbox);
  const file = path.join(inbox, 'article.html');
  const bytes = htmlBytes('<meta charset=Shift_JIS>', Buffer.from('93fa967b', 'hex'));
  await fs.writeFile(file, bytes);
  const result = await runDirectoryImportBatch({
    consumePolicy: 'clear', highlightPolicy: 'reference_only', rootPath: inbox,
    sourceAdapter: 'foliole_managed_inbox_folder', titleStrategy: 'file_name',
    sources: await discoverDirectoryImportSources(inbox)
  });
  expect(result).toMatchObject({ imported_count: 1, consumed_count: 1 });
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result.entries[0]!.node_id!))
    .toMatchObject({ content: '日本' });
  await expect(fs.stat(file)).rejects.toThrow();
  expect(await fs.readFile(path.join(root, 'trashed.html'))).toEqual(bytes);
});
