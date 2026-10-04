import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { continueDesktopSyncGroupSync } from '../../../electron/sync/desktopSyncGroupTransport.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { loadNodeBodyResolution } from '../../../lib/core/database/nodeBodyResolution.js';
import { applyLocalContentEdit } from '../../../lib/core/sync/localContentEdit.js';
import { createOpaqueVersionRef } from '../../../lib/core/sync/opaqueSyncRefs.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

import { snapshotInput } from './input.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

function assertEditedBodies(source: SimulatorPeer, target: SimulatorPeer, ids: string[]) {
  for (const id of ids) {
    const sourceBody = loadNodeBodyResolution(source.driver, id);
    const targetBody = loadNodeBodyResolution(target.driver, id);
    expect(sourceBody?.status).toBe('resolved');
    expect(targetBody?.status).toBe('resolved');
    if (sourceBody?.status === 'resolved' && targetBody?.status === 'resolved') {
      expect(targetBody.content).toBe(sourceBody.content);
    }
  }
}

async function cloneAssets(source: string, target: string) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error('benchmark_asset_entry_not_file');
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    await fs.copyFile(from, to, constants.COPYFILE_FICLONE);
  }
}

async function openPair(base: string, root: string, label: string) {
  for (const name of ['a', 'b']) {
    const destination = path.join(root, name);
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(path.join(base, 'foliole.db'), path.join(destination, 'foliole.db'),
      constants.COPYFILE_FICLONE);
    await cloneAssets(path.join(base, 'assets'), path.join(destination, 'assets'));
  }
  const peers = ['a', 'b'].map((name) => openPeer(root, name, label));
  pairPeers(peers);
  return peers as [SimulatorPeer, SimulatorPeer];
}

function selectTopics(database: string, count: number) {
  const sqlite = new Database(database, { readonly: true, fileMustExist: true });
  try {
    const ids = sqlite.prepare(`SELECT id FROM nodes WHERE kind = 'topic'
      AND id NOT IN ('special-inbox', 'special-virtual-root') AND deleted_at IS NULL
      AND current_version_id IS NOT NULL
      ORDER BY id LIMIT ?`).pluck().all(count) as string[];
    if (ids.length !== count) throw new Error(`benchmark_topic_count_insufficient:${ids.length}`);
    return ids;
  } finally { sqlite.close(); }
}

function seedTopics(root: string, count: number) {
  process.env.FOLIOLE_SIM_SCENARIO = 'performance-base';
  resetOperations();
  const peer = openPeer(root, 'base', 'performance-base');
  try {
    const available = peer.driver.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM nodes
      WHERE kind = 'topic' AND deleted_at IS NULL AND current_version_id IS NOT NULL`)?.count ?? 0;
    for (let index = available; index < count; index += 1) {
      edit(peer, `baseline article ${index}`, `benchmark-topic-${String(index).padStart(4, '0')}`);
    }
  } finally { peer.sqlite.close(); }
}

async function editTopics(peer: SimulatorPeer, ids: string[], label: string) {
  for (const [index, id] of ids.entries()) {
    const port = createBetterSqliteDbPort(peer.sqlite);
    const current = await loadCurrentSyncNodeRecord(port, id);
    if (!current?.version_id) throw new Error(`benchmark_node_version_missing:${id}`);
    await inPeer(peer, () => applyLocalContentEdit(port, {
      baseVersionId: current.version_id!, content: `${current.body_text}\nT322 benchmark ${index}`,
      hideTitleHeading: current.snapshot.hide_title_heading,
      hostName: peer.name, nodeId: id, title: current.snapshot.title,
      updatedAt: new Date(Date.UTC(2026, 10, 1) + index * 1000).toISOString(),
      versionId: createOpaqueVersionRef(`T322:${label}:${index}`)
    }, undefined, { enqueueSearchInvalidations: false }));
  }
}

function currentStatesEqual(a: SimulatorPeer, b: SimulatorPeer, ids: string[]) {
  const read = (peer: SimulatorPeer, id: string) => peer.sqlite.prepare(`SELECT content_hash,
    current_version_id FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`)
    .get(id);
  return ids.every((id) => JSON.stringify(read(a, id)) === JSON.stringify(read(b, id)));
}

async function runOldBilateral(a: SimulatorPeer, b: SimulatorPeer,
  source: Endpoint, ids: string[]) {
  const reverse = await serve(b);
  const results = [];
  try {
    for (let round = 0; round < 4; round += 1) {
      const received = await inPeer(b, () => continueDesktopSyncGroupSync(route(source, b)));
      const sent = await inPeer(a, () => continueDesktopSyncGroupSync(route(reverse, a)));
      results.push({ received, sent });
      if (currentStatesEqual(a, b, ids)) {
        return { results, reverseBytes: reverse.transferBytes(),
          reverseRequests: reverse.requests.length,
          reversePackRequests: reverse.requests.filter((url) =>
            url.startsWith('/companion/sync-pack?')).length };
      }
    }
    throw new Error('benchmark_old_bilateral_incomplete');
  } finally { await reverse.close(); }
}

async function prepareBaseline(a: SimulatorPeer, b: SimulatorPeer,
  server: Endpoint, kind: 'old' | 'identity') {
  const highWater = a.sqlite.prepare(`SELECT high_water FROM sync_state_sequence
    WHERE singleton_id = 1`).pluck().get() as number;
  if (kind === 'old') {
    const epoch = a.sqlite.prepare(`SELECT source_epoch FROM sync_state_sequence
      WHERE singleton_id = 1`).pluck().get() as string;
    b.sqlite.prepare(`INSERT INTO sync_pack_receive_progress (group_id, peer_id,
      source_epoch, cursor_state_seq, frontier_state_seq, restore_id, completed,
      updated_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`).run(
        'group', a.id, epoch, highWater, highWater, '2026-10-04T00:00:00.000Z');
  } else await inPeer(b, () => runDesktopSyncIdentityRound(route(server, b)));
  return { highWater, bytes: server.transferBytes(), requests: server.requests.length };
}

async function runCase(base: string, output: string, ids: string[], kind: 'old' | 'identity') {
  process.env.FOLIOLE_BENCHMARK_ACTIVE_PATH = kind;
  const peers = await openPair(base, output, `benchmark-${kind}-${ids.length}`);
  const [a, b] = peers;
  try {
    const server = await serve(a);
    try {
      const baseline = await prepareBaseline(a, b, server, kind);
      await editTopics(a, ids, `benchmark-${ids.length}`);
      const sourceStateRowsAfterBaseline = a.sqlite.prepare(`SELECT COUNT(*)
        FROM sync_object_state WHERE state_seq > ?`).pluck().get(baseline.highWater) as number;
      const started = performance.now();
      let result: unknown = null;
      let error: string | null = null;
      try {
        result = kind === 'old'
          ? await runOldBilateral(a, b, server, ids)
          : await inPeer(b, () => runDesktopSyncIdentityRound(route(server, b)));
        assertEditedBodies(a, b, ids);
      } catch (caught) {
        const cause = caught instanceof Error && caught.cause instanceof Error
          ? `:${caught.cause.message}` : '';
        error = `${String(caught)}${cause}`;
      }
      const durationMs = performance.now() - started;
      const totalBytes = server.transferBytes();
      const reverse = kind === 'old' && result && typeof result === 'object' &&
        'reverseBytes' in result ? result as Awaited<ReturnType<typeof runOldBilateral>> : null;
      return { kind, modifiedTopics: ids.length, baselineHighWater: baseline.highWater,
        sourceStateRowsAfterBaseline, durationMs,
        transferBytes: { received: totalBytes.received - baseline.bytes.received +
            (reverse?.reverseBytes.received ?? 0),
          sent: totalBytes.sent - baseline.bytes.sent + (reverse?.reverseBytes.sent ?? 0),
          total: totalBytes.total - baseline.bytes.total + (reverse?.reverseBytes.total ?? 0) },
        requests: server.requests.length - baseline.requests +
          (reverse?.reverseRequests ?? 0),
        sourcePackRequests: server.requests.slice(baseline.requests).filter((url) =>
          url.startsWith('/companion/sync-pack?')).length +
          (reverse?.reversePackRequests ?? 0),
        identityPackRequests: server.requests.slice(baseline.requests).filter((url) =>
          url.startsWith('/companion/sync-identity-pack')).length,
        result, error, lastRequests: server.requests.slice(-8),
        lastResponseEvents: server.responseEvents.slice(-12) };
    } finally { await server.close(); }
  } finally { for (const peer of peers) peer.sqlite.close(); }
}

/** Same WAL-aware main-library snapshot; every mutation remains in external-drive copies. */
export async function runIdentityPerformanceComparison(args: {
  database: string; assets: string; output: string; count: number;
  preparedBase?: string;
  kinds?: readonly ('identity' | 'old')[];
}) {
  let source: Awaited<ReturnType<typeof snapshotInput>> | null = null;
  if (!args.preparedBase) {
    source = await snapshotInput(args.database, args.assets, path.join(args.output, 'base'));
    if (source.unreadableArticleIds.length || source.resourceIssues.length) {
      throw new Error(`benchmark_source_incomplete:${source.unreadableArticleIds.length}:` +
        source.resourceIssues.length);
    }
    seedTopics(args.output, args.count);
  }
  const base = args.preparedBase ?? source!.destination;
  const ids = selectTopics(path.join(base, 'foliole.db'), args.count);
  const reports = [];
  for (const kind of args.kinds ?? ['identity', 'old'] as const) {
    const report = await runCase(base, path.join(args.output, kind), ids, kind);
    reports.push(report);
    await fs.writeFile(path.join(args.output, `${kind}.json`), JSON.stringify(report, null, 2));
  }
  return { source: source ? { sourceSchemaVersion: source.sourceSchemaVersion,
    schemaVersion: source.schemaVersion, counts: source.counts, requestedTopics: args.count } :
    { preparedBase: base, requestedTopics: args.count }, reports };
}
