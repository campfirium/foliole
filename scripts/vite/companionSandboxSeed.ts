import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { ensureSyncSpecialRootNodes } from '../../lib/core/sync/syncSpecialRootNodes';

const hostName = 'Foliole Sandbox';
const seedTime = '2026-01-01T00:00:00.000Z';

function seedNode(id: string, title: string, fields: Partial<WorkspaceNodeSnapshot> = {}): WorkspaceNodeSnapshot {
  return {
    id, title, parentNodeId: null, kind: 'folder', content: '', isTitleManual: true,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: seedTime, updatedAt: seedTime, ...fields
  };
}

function sandboxNodes() {
  return [
    seedNode('sandbox-projects', 'Sample Projects'),
    seedNode('sandbox-empty', 'Empty Folder'),
    seedNode('sandbox-topic', 'Sample Field Notes', {
      parentNodeId: 'sandbox-projects', kind: 'topic',
      content: '## Field notes\n\nSample material for checking reading, search, and menu changes.'
    }),
    seedNode('sandbox-item', 'Field note prompt', {
      parentNodeId: 'sandbox-projects', kind: 'item', content: 'What belongs in a field note?',
      reveal: 'What you observed, where it happened, and when it happened.', initialReviewDue: seedTime
    }),
    seedNode('sandbox-dive', 'Sample Dive', { virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['sandbox-projects'] }),
    seedNode('sandbox-index', 'Sample Index', {
      parentNodeId: VIRTUAL_ROOT_NODE_ID, virtualFilter: createManualVirtualNodeFilter(), manualChildOrder: ['sandbox-topic']
    }),
    seedNode('sandbox-trash', 'Deleted Example', {
      kind: 'topic', content: 'An example for the Trash restore menu.', deletedAt: seedTime
    })
  ];
}

async function seedSandbox(database: Database.Database) {
  const db = createBetterSqliteDbPort(database);
  await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: hostName, now: seedTime });
  const nodes = sandboxNodes();
  const records = await Promise.all(nodes.map(node => toWorkspaceNativeNodeVersion(node, hostName, `ver_${node.id}`)));
  await db.transaction(async tx => {
    await ensureSyncSpecialRootNodes(tx, [{ nodeId: VIRTUAL_ROOT_NODE_ID, referencedAt: seedTime }]);
    const result = await applySyncNodesWithDbPort(tx, records, { operation: 'local_mutation', enqueueSearchInvalidations: false });
    if (result.appliedIds.length !== nodes.length) throw new Error('The sandbox seed did not install all sample nodes.');
  });
}

function seedSandboxReferences(database: Database.Database) {
  const sourceId = 'sandbox-references';
  const title = 'Field Guide';
  const opening = 'A sample external document for browsing in the sandbox.';
  const content = `# ${title}\n\n${opening}`;
  const contentHash = createHash('sha256').update(content).digest('hex');

  database.transaction(() => {
    database.prepare(`INSERT INTO external_search_folders
      (id, folder_path, attachment_mode, document_count, indexed_at, created_at, updated_at, source_ref)
      VALUES (?, ?, 'document_relative', 1, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .run(sourceId, '/sandbox/Sample References', seedTime, seedTime, seedTime, sourceId);
    database.prepare(`INSERT INTO external_documents
      (document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
       source_modified_ms, content_hash, title, opening_text, content, indexed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'md', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(document_id) DO NOTHING`)
      .run('sandbox-reference-guide', sourceId, 'Guides/Field Guide.md', 'Field Guide.md', Buffer.byteLength(content),
        seedTime, Date.parse(seedTime), contentHash, title, opening, content, seedTime, seedTime, seedTime);
  })();
}

export function assertCompanionSandboxPath(projectRoot: string, databaseFile: string) {
  const previewRoot = path.resolve(projectRoot, '.cache/companion-preview');
  const sandboxRoot = path.join(previewRoot, 'sandbox');
  const expectedFile = path.join(sandboxRoot, 'foliole-companionSQLite.db');
  if (path.resolve(databaseFile) !== expectedFile ||
      realpathSync(sandboxRoot) !== path.join(realpathSync(previewRoot), 'sandbox')) {
    throw new Error('Sandbox mode requires its own preview database directory.');
  }
  if (existsSync(databaseFile)) {
    const file = lstatSync(databaseFile);
    if (!file.isFile() || file.nlink !== 1) throw new Error('The sandbox database cannot be a link.');
  }
}

/** Called after the sandbox server has acquired its dedicated port, before it serves any database request. */
export async function prepareCompanionSandbox(databaseFile: string, reset: boolean) {
  if (!reset && existsSync(databaseFile)) {
    const database = new Database(databaseFile, { fileMustExist: true });
    try {
      seedSandboxReferences(database);
    } finally {
      database.close();
    }
    return;
  }
  const temporary = mkdtempSync(path.join(path.dirname(databaseFile), '.sandbox-seed-'));
  const source = path.join(temporary, 'seed.db');
  try {
    const seed = new Database(source);
    try {
      await seedSandbox(seed);
      seedSandboxReferences(seed);
      if (existsSync(databaseFile)) await seed.backup(databaseFile);
    } finally {
      seed.close();
    }
    if (!existsSync(databaseFile)) renameSync(source, databaseFile);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
