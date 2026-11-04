import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../../../electron/database/betterSqliteDbPort.js';
import { textBranch } from '../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../electron/sync/desktopFramedSyncFiles.js';
import { initializeDatabaseSchema } from '../../database/migrations.js';
import type { CanonicalFact } from '../framedSyncCanonicalManifest.js';
import { withRequestSyncFiles } from '../requestSyncFiles.js';
import { receiveRequestSyncObjectMessages } from '../requestSyncObjectReceiver.js';
import { applyConvergentSyncNodesWithDbPort } from '../syncNodeConvergence.js';

import type { FolderSyncSourceHost, FolderSyncSourceSnapshot, FolderSyncStagedObject } from './sourceSnapshot.js';

export async function createFolderSourceFixture() {
  const base = path.resolve('.tmp/artifacts/T692/production');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'source-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
  sqlite.pragma('journal_mode = WAL');
  const db = createBetterSqliteDbPort(sqlite);
  const reader = new Database(path.join(root, 'library.db'), { readonly: true });
  const readDb = createBetterSqliteDbPort(reader, { transactionMode: 'deferred' });
  const files = createDesktopFramedSyncFiles(path.join(root, 'scratch'));
  const host: FolderSyncSourceHost = { files, write: execute => db.transaction(execute),
    readSnapshot: execute => readDb.transaction(execute) };
  const first = textBranch('v1', 'First article', undefined, '2026-11-04T00:00:00.000Z');
  await applyConvergentSyncNodesWithDbPort(db, [first]);
  return { root, sqlite, db, host, files, first, close() { reader.close(); sqlite.close(); } };
}

export async function inspectStagedObject(host: FolderSyncSourceHost,
  snapshot: FolderSyncSourceSnapshot, object: FolderSyncStagedObject) {
  return withRequestSyncFiles(host.files, async files => {
    const header = await receiveRequestSyncObjectMessages(snapshot.messages(object), snapshot.contextId, files);
    const facts: CanonicalFact[] = [];
    const bodies: string[] = [];
    const tableMessages: string[] = [];
    for await (const fact of files.readFacts()) {
      facts.push(fact);
      for (const blob of fact.blobs) bodies.push(new TextDecoder().decode(await files.loadBody(blob)));
    }
    if (files.dailyFlow.complete) {
      for await (const message of files.dailyFlow.messages()) tableMessages.push(message.payloadCase);
    }
    return { header, facts, bodies, tableMessages };
  });
}
