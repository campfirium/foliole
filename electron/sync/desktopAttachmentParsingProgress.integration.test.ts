// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import * as workBudget from '../../lib/core/sync/attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance,
  runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

afterEach(() => vi.restoreAllMocks());

async function seedArticles(sqlite: Database.Database) {
  const records = Array.from({ length: 4 }, (_, index) => {
    const record = textBranch(`version-${index}`, 'No attachment');
    record.object_id = `article-${index}`;
    record.snapshot.id = record.object_id;
    return record;
  });
  await applyConvergentSyncNodesWithDbPort(createBetterSqliteDbPort(sqlite), records);
}

function savedState(file: string) {
  const sqlite = new Database(file, { readonly: true });
  try {
    return { queued: sqlite.prepare('SELECT article_id FROM attachment_parse_queue ORDER BY article_id').pluck().all(),
      missing: sqlite.prepare('SELECT storage_key FROM attachment_pending ORDER BY storage_key').pluck().all(),
      articles: sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all() };
  } finally { sqlite.close(); }
}

async function fixture(side: 'local' | 'remote' | 'both', keys: string[] = []) {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', `${directory.root}/target`);
  const local = await attachmentHttpSource(keys, directory.root);
  await seedAttachmentTarget(keys);
  if (side !== 'remote') await seedArticles(local.sqlite);
  if (side !== 'local') await runWithDatabaseConnectionOwner(() => seedArticles(openDatabaseConnection().sqlite));
  const targetPath = resolveRuntimeDataPaths().databasePath;
  const server = await attachmentHttpServer(0);
  const exchange = createDesktopRequestSyncExchange({ endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  const baseline = [local.databasePath, targetPath].map(savedState);
  return { local, exchange, server, targetPath, baseline,
    states: () => [local.databasePath, targetPath].map(savedState),
    async close() {
      await server.close(); await local.close();
      await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
      clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
      vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
    } };
}

function oneArticlePerSlice(host: RequestSyncAttachmentHost): RequestSyncAttachmentHost {
  vi.spyOn(workBudget, 'attachmentWorkBudget').mockImplementation(() => () => true);
  return { ...host, needsSlice: (_budget, excluded) => host.needsSlice(() => true, excluded) };
}

function expectDrained(current: ReturnType<typeof savedState>[], baseline: ReturnType<typeof savedState>[]) {
  current.forEach((state, index) => {
    expect(state.queued).toEqual([]);
    expect(state.missing).toEqual([]);
    expect(state.articles).toEqual(baseline[index]!.articles);
  });
}

it.each(['local', 'remote'] as const)('drains a %s parsing-only backlog over HTTP without restarting the data round', async side => {
  const app = await fixture(side);
  const host = oneArticlePerSlice(app.local.host);
  try {
    expect(app.baseline[side === 'local' ? 0 : 1]!.queued).toHaveLength(5);
    const result = await exchangeRequestSyncAttachments(host, app.exchange, (_key, error) => { throw error; });
    expect(result).toMatchObject({ pending: 0, blocks: 0, transferred: 0, yielded: false });
    expectDrained(app.states(), app.baseline);
  } finally { await app.close(); }
});

it('yields parsing to queued priority data and resumes after that data releases its turn', async () => {
  const app = await fixture('both');
  const limited = oneArticlePerSlice(app.local.host);
  let release: (() => void) | undefined;
  const host = { ...limited, async needsSlice(...args: Parameters<typeof limited.needsSlice>) {
    const result = await limited.needsSlice(...args);
    release ??= workBudget.waitForAttachmentWorkYield();
    return result;
  } };
  try {
    const first = await exchangeRequestSyncAttachments(host, app.exchange, (_key, error) => { throw error; });
    expect(first).toMatchObject({ pending: null, blocks: 0, yielded: true });
    expect(app.server.attachmentRequests()).toBe(1);
    app.states().forEach(state => expect(state.queued).toHaveLength(4));
    release!(); release = undefined;
    const next = await exchangeRequestSyncAttachments(limited, app.exchange, (_key, error) => { throw error; });
    expect(next).toMatchObject({ pending: 0, blocks: 0, yielded: false });
    expectDrained(app.states(), app.baseline);
  } finally { release?.(); await app.close(); }
});

it('leaves genuinely missing files pending without spinning or requesting immediate continuation', async () => {
  const key = `${'a'.repeat(64)}.png`;
  const app = await fixture('local', [key]);
  const errors: unknown[] = [];
  try {
    const result = await exchangeRequestSyncAttachments(app.local.host, app.exchange, (_key, error) => errors.push(error));
    expect(result).toMatchObject({ blocks: 0, yielded: false });
    expect(result.pending).not.toBe(0);
    expect(errors).toHaveLength(1);
    expect(app.server.attachmentRequests()).toBe(2);
    app.states().forEach(state => {
      expect(state.queued).toEqual([]);
      expect(state.missing).toEqual([key]);
    });
  } finally { await app.close(); }
});

it('bounds preparation-only passes when a durable article cannot be retired', async () => {
  const app = await fixture('remote');
  const host = oneArticlePerSlice(app.local.host);
  await runWithDatabaseConnectionOwner(() => openDatabaseConnection().sqlite.exec(`CREATE TRIGGER retain_queue
    BEFORE DELETE ON attachment_parse_queue BEGIN SELECT RAISE(IGNORE); END`));
  try {
    const result = await exchangeRequestSyncAttachments(host, app.exchange, (_key, error) => { throw error; });
    expect(result).toMatchObject({ pending: null, blocks: 0, yielded: true });
    expect(app.server.attachmentRequests()).toBeLessThanOrEqual(64);
    expect(app.states()[1]!.queued).toEqual(app.baseline[1]!.queued);
  } finally { await app.close(); }
});

it('preserves cancellation raised between parsing passes', async () => {
  const app = await fixture('local');
  const limited = oneArticlePerSlice(app.local.host);
  const controller = new AbortController();
  const reason = new Error('cancel_parsing');
  const host = { ...limited, async needsSlice(...args: Parameters<typeof limited.needsSlice>) {
    const result = await limited.needsSlice(...args);
    controller.abort(reason);
    return result;
  } };
  try {
    await expect(exchangeRequestSyncAttachments(host, { ...app.exchange, signal: controller.signal },
      (_key, error) => { throw error; })).rejects.toBe(reason);
    expect(app.states()[0]!.queued).toHaveLength(4);
  } finally { await app.close(); }
});
