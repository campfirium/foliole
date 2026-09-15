/* global console, process */

import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredAbsolute(name) {
  const value = arg(name);
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return path.resolve(value);
}

const libraryHome = requiredAbsolute('--library-home');
const userData = requiredAbsolute('--user-data-dir');
const nodeIdsPath = requiredAbsolute('--node-ids-json');
const outputPath = requiredAbsolute('--output-json');
const remoteDocumentsPath = arg('--remote-documents-json')
  ? requiredAbsolute('--remote-documents-json') : null;
const mode = arg('--mode') ?? 'cover';
if (mode !== 'body' && mode !== 'cover') throw new Error('--mode must be body or cover');

process.env.FOLIOLE_LIBRARY_HOME = libraryHome;
app.setName('Foliole');
app.setPath('userData', userData);

async function run() {
  console.error('[cover-repair] waiting for Electron');
  await app.whenReady();
  console.error('[cover-repair] Electron ready');
  const [database, migration, coverRepair, bodyRepair, connectionState, hostAssignment, sourceMode] = await Promise.all([
    import('../../dist/electron/database/connection.js'),
    import('../../dist/electron/database/migrate.js'),
    import('../../dist/electron/import/readwiseApiEpubCoverRepair.js'),
    import('../../dist/electron/import/readwiseApiEpubBodyRepair.js'),
    import('../../dist/electron/import/readwiseApiConnectionState.js'),
    import('../../dist/electron/database/readwiseHostAssignment.js'),
    import('../../dist/electron/database/readwiseSourceMode.js')
  ]);
  const { closeDatabaseConnection } = database;
  migration.initializeDatabase(undefined, { deferSearchIndex: true });
  const nodeIds = JSON.parse(await fs.readFile(nodeIdsPath, 'utf8'));
  if (!Array.isArray(nodeIds) || nodeIds.some((value) => typeof value !== 'string')) {
    throw new Error('node ids must be a JSON string array');
  }
  const remoteDocuments = remoteDocumentsPath
    ? JSON.parse(await fs.readFile(path.resolve(remoteDocumentsPath), 'utf8')).found : null;
  const remoteByNodeId = remoteDocuments ? mapRemoteDocuments(nodeIds, remoteDocuments) : null;
  if (!remoteByNodeId) {
    console.error('[cover-repair] readiness', JSON.stringify({
      connection: connectionState.toPublicReadwiseApiConnection(),
      host: hostAssignment.loadReadwiseHostAssignment(),
      sourceMode: sourceMode.loadReadwiseSourceModeState()
    }));
  }
  const results = [];
  for (const nodeId of nodeIds) {
    const startedAt = new Date().toISOString();
    console.error('[cover-repair] starting', nodeId);
    try {
      const result = mode === 'body'
        ? await bodyRepair.repairReadwiseApiEpubBodiesFromRemote(nodeId, remoteByNodeId.get(nodeId))
        : remoteByNodeId
          ? await coverRepair.repairReadwiseApiEpubCoverFromRemote(nodeId, remoteByNodeId.get(nodeId))
          : await coverRepair.repairReadwiseApiEpubCover(nodeId, { minIntervalMs: 0 });
      results.push({ ...result, startedAt });
      console.error('[cover-repair] finished', nodeId, result.status);
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        nodeId,
        startedAt,
        status: 'failed'
      });
      console.error('[cover-repair] failed', nodeId, error);
    }
  }
  const payload = {
    completed: results.filter((item) => item.status !== 'failed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    libraryHome,
    results
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(payload, null, 2));
  const exitCode = payload.failed ? 2 : 0;
  closeDatabaseConnection();
  app.exit(exitCode);
}

run().catch((error) => {
  console.error('[cover-repair] fatal', error);
  app.exit(1);
});

function mapRemoteDocuments(nodeIds, documents) {
  if (!Array.isArray(documents)) throw new Error('remote documents must be an array');
  const byNodeId = new Map(documents.map((document) => [document.nodeId, document]));
  for (const nodeId of nodeIds) {
    if (!byNodeId.get(nodeId)) throw new Error(`remote document missing for ${nodeId}`);
  }
  return byNodeId;
}
