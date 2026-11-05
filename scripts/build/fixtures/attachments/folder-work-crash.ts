import assert from 'node:assert/strict';
import { copyFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../../../electron/database/betterSqliteDbPort.js';
import { completeFolderAttachmentCopy, confirmFolderAttachmentCopy, prepareFolderAttachmentCopy,
  readFolderAttachmentWork } from '../../../../lib/core/database/companionFolderAttachmentWork.js';

const [root, boundary, key, base64] = process.argv.slice(2);
assert(root && key && base64);
const sqlite = new Database(path.join(root, 'source.sqlite'));
sqlite.pragma('journal_mode=WAL');
sqlite.pragma('synchronous=FULL');
const db = createBetterSqliteDbPort(sqlite);
const stop = () => {
  writeFileSync(path.join(root, 'crash-boundary'), boundary);
  process.kill(process.pid, 'SIGKILL');
};
if (boundary.startsWith('delete-')) {
  await prepareFolderAttachmentCopy(db, key, 'delete');
  if (boundary === 'delete-before-source') stop();
  unlinkSync(path.join(root, 'source', key));
  if (boundary === 'delete-after-source') stop();
  await db.transaction(tx => completeFolderAttachmentCopy(tx, key));
  if (boundary === 'delete-after-ready') stop();
  await sqlite.backup(path.join(root, 'Foliole.sqlite'));
  unlinkSync(path.join(root, 'target', key));
  if (boundary === 'delete-after-target') stop();
  const [work] = await readFolderAttachmentWork(db, 'profile');
  assert(work);
  await confirmFolderAttachmentCopy(db, 'profile', work);
  if (boundary === 'delete-after-confirm') stop();
  throw new Error('Unknown deletion boundary');
}
await prepareFolderAttachmentCopy(db, key);
if (boundary === 'before-source') stop();
const file = path.join(root, 'source', key);
writeFileSync(`${file}.partial`, Buffer.from(base64, 'base64'));
renameSync(`${file}.partial`, file);
if (boundary === 'after-source') stop();
await db.transaction(tx => completeFolderAttachmentCopy(tx, key));
if (boundary === 'after-ready') stop();
const [work] = await readFolderAttachmentWork(db, 'profile');
assert(work);
copyFileSync(file, path.join(root, 'target', key));
if (boundary === 'after-target') stop();
await confirmFolderAttachmentCopy(db, 'profile', work);
if (boundary === 'after-confirm') stop();
throw new Error('Unknown crash boundary');
