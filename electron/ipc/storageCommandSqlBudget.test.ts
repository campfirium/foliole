// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-storage-command-sql-budget-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { assertSqlQueryBudget, assertSqlScaleInvariant } from '../database/sqlQueryBudget.testSupport.js';
import { measureSqlStatements, type SqlStatementReport } from '../database/sqlStatementMeter.testSupport.js';

import { handleStorageCommand } from './storageCommands.js';

const AT = '2026-10-19T00:00:00.000Z';
const TARGET = 'topic-0';
const SMALL = 3;
const LARGE = 40;

let tempRoot = '';

function seedNode(nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic', position: number) {
  upsertNodeSnapshot({
    anchorLink: null, content: `# ${nodeId}\n\nBody of ${nodeId} links [[topic-1]].`, createdAt: AT,
    isTitleManual: true, kind, nodeId, parentNodeId, position, reveal: null, title: nodeId, updatedAt: AT
  });
}

async function openLibrary(topicCount: number) {
  closeDatabaseConnection();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-command-sql-budget-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seedNode('folder-root', null, 'folder', 0);
  for (let index = 0; index < topicCount; index++) seedNode(`topic-${index}`, 'folder-root', 'topic', index);
}

async function measureCommand(topicCount: number, command: string, args: () => Record<string, unknown>) {
  await openLibrary(topicCount);
  await handleStorageCommand(command, args());
  const { report } = await measureSqlStatements(() => handleStorageCommand(command, args()));
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  return report;
}

async function measureAtBothScales(command: string, args: () => Record<string, unknown>) {
  const small = await measureCommand(SMALL, command, args);
  const large = await measureCommand(LARGE, command, args);
  return { large, small } satisfies Record<string, SqlStatementReport>;
}

let tick = 0;
function nextTimestamp() {
  tick += 1;
  return new Date(Date.parse(AT) + tick * 1000).toISOString();
}

function contentEditArgs() {
  return {
    content: `# ${TARGET}\n\nEdited ${tick}`, createdAt: AT, isTitleManual: true, kind: 'topic',
    nodeId: TARGET, parentNodeId: 'folder-root', position: 0, reveal: null, title: TARGET, updatedAt: nextTimestamp()
  };
}

beforeEach(() => { tick = 0; });

afterEach(async () => {
  closeDatabaseConnection();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

const POINT_COMMANDS: Array<[string, string, () => Record<string, unknown>]> = [
  ['opening one document', NATIVE_COMMANDS.loadNodeDocument, () => ({ nodeId: TARGET })],
  ['recording that a document was opened', NATIVE_COMMANDS.saveNodeOpenState,
    () => ({ lastOpenedAt: nextTimestamp(), nodeId: TARGET })],
  ['saving typed content of one document', NATIVE_COMMANDS.updateNodeContent, contentEditArgs]
];

it.each(POINT_COMMANDS)('keeps SQL work for %s independent of library size', async (label, command, args) => {
  const { large, small } = await measureAtBothScales(command, args);
  expect(small.statements).toBeGreaterThan(0);
  assertSqlScaleInvariant(label, small, large);
});

async function measureBacklinks(topicCount: number) {
  await openLibrary(topicCount);
  const { sqlite } = openDatabaseConnection();
  sqlite.prepare("UPDATE nodes SET content = 'Plain body without links'").run();
  const update = sqlite.prepare('UPDATE nodes SET content = ? WHERE id = ?');
  update.run('First [[topic-0]]', 'topic-1');
  update.run('Second [[ TOPIC-0 ]]', 'topic-2');
  const { report, result } = await measureSqlStatements(() =>
    handleStorageCommand(NATIVE_COMMANDS.loadNodeBacklinks, { node_id: TARGET }));
  expect(result).toEqual([
    { source_node_id: 'topic-1', source_title: 'topic-1', context: 'First [[topic-0]]', match_count: 1 },
    { source_node_id: 'topic-2', source_title: 'topic-2', context: 'Second [[ TOPIC-0 ]]', match_count: 1 }
  ]);
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  return report;
}

it('keeps SQL work for loading one document backlinks independent of library size', async () => {
  const small = await measureBacklinks(SMALL);
  const large = await measureBacklinks(LARGE);
  assertSqlScaleInvariant('loading one document backlinks', small, large);
  expect([small.rowsRead, large.rowsRead]).toEqual([3, 3]);
});

it('loads the workspace list with a statement count that does not grow per node', async () => {
  const args = () => ({ includePdfOpenings: true });
  const { large, small } = await measureAtBothScales(NATIVE_COMMANDS.loadWorkspaceListSnapshot, args);
  assertSqlScaleInvariant('loading the workspace list', small, large, { allowRowGrowth: true });
  assertSqlQueryBudget('loading the workspace list', large, { maxRepeatsPerStatement: 2 });
});
