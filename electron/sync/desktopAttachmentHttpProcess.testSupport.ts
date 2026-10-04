import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const worker = `
import Database from ${JSON.stringify(pathToFileURL(path.join(process.cwd(), 'node_modules/better-sqlite3/lib/index.js')).href)};
import { receiveDesktopAttachmentRanges } from './electron/sync/desktopAttachmentRangeTransfer.js';
import { createAttachmentReceiveCheckpoint } from './lib/core/sync/attachmentReceiveCheckpoint.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './lib/core/database/syncPackProgressSchemaStatements.js';
import { createDesktopSyncGroupSignedHeaders, readDesktopWorkgroupResponse } from './electron/sync/desktopSyncGroupHttp.js';
const [origin, filePath, contentHash, size, mode] = process.argv.slice(2);
const db = new Database(filePath + '.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
db.exec('CREATE TABLE IF NOT EXISTS received_nonces (nonce TEXT PRIMARY KEY)');
globalThis.receiverDb = db;
const checkpoint = createAttachmentReceiveCheckpoint({
  query: async (sql, params) => db.prepare(sql).all(...params),
  run: async (sql, params) => db.prepare(sql).run(...params)
}, filePath, contentHash);
const offsets = [];
let peakRss = process.memoryUsage().rss;
await receiveDesktopAttachmentRanges({ filePath, contentHash, expectedBytes: Number(size), checkpoint,
  requestRange: async (offset) => {
    if (mode === 'kill' && offset === 2097152) {
      process.kill(process.pid, 'SIGKILL');
      await new Promise(() => {});
    }
    offsets.push(offset);
    const query = new URLSearchParams({ attachment_id: contentHash, content_hash: contentHash, storage_key: contentHash + '.png',
      offset: String(offset), length: '1048576' });
    const pathWithQuery = '/companion/attachment-resource?' + query;
    const response = await fetch(origin + pathWithQuery, {
      headers: createDesktopSyncGroupSignedHeaders({ groupId: 'group', localDeviceId: 'receiver',
        method: 'GET', pathWithQuery, secret: Buffer.alloc(32, 7).toString('base64url') }),
      signal: AbortSignal.timeout(30000)
    });
    const body = await readDesktopWorkgroupResponse({ response, groupId: 'group', method: 'GET',
      pathWithQuery, contentType: 'application/octet-stream', maxEnvelopeBytes: 1500000 });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return { body, totalBytes: Number(response.headers.get('x-foliole-resource-total-bytes')) };
  }
});
const checkpoints = db.prepare('SELECT COUNT(*) AS count FROM attachment_receive_checkpoints').get().count;
db.close();
process.stdout.write(JSON.stringify({ offsets, peakRss, checkpoints }));
`;

export async function compileAttachmentHttpWorker(root: string) {
  const files = ['electron/sync/desktopAttachmentRangeTransfer.ts', 'electron/sync/resourceFileHash.ts',
    'lib/platform/resourceAvailabilityContract.ts', 'lib/platform/attachmentResource.ts',
    'lib/core/sync/attachmentReceiveCheckpoint.ts',
    'lib/core/database/syncPackProgressSchemaStatements.ts', 'electron/sync/desktopSyncGroupHttp.ts',
    'electron/sync/desktopSyncGroupSignedHeaders.ts', 'electron/sync/workgroupHttpCrypto.ts',
    'electron/sync/workgroupAeadNode.ts'];
  for (const relative of files) {
    const source = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
    } }).outputText;
    await write(root, relative.replace(/\.ts$/u, '.js'), output);
  }
  // Isolate application initialization and credential lookup, retaining product crypto and HTTP.
  await write(root, 'electron/database/connection.js',
    'export async function runWithDatabaseConnectionOwner(task) { return task(); }');
  await write(root, 'electron/sync/workgroupKeyStore.js', `
    export function loadDesktopWorkgroupKey() {
      return { group_id: 'group', group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' };
    }
    export function consumeDesktopWorkgroupNonce(group, nonce) {
      return globalThis.receiverDb.prepare('INSERT OR IGNORE INTO received_nonces VALUES (?)').run(nonce).changes === 1;
    }
  `);
  await write(root, 'package.json', '{"type":"module"}');
  await write(root, 'worker.mjs', worker);
  return path.join(root, 'worker.mjs');
}

async function write(root: string, relative: string, text: string) {
  const destination = path.join(root, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, text);
}
