import { fork, type ChildProcess } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { build } from 'vite';

export type DesktopFramedSyncFixtureSnapshot = Readonly<{
  databasePath: string;
  deviceId: string;
  origin: string;
  pid: number;
  stateRoot: string;
  workspace: unknown;
}>;

type PendingReply = Readonly<{
  reject(error: Error): void;
  resolve(value: unknown): void;
}>;

type FixtureReply = Readonly<{ error?: string; id: number; result?: unknown }>;

export type DesktopFramedSyncFixtureProcess = ReturnType<typeof startFixtureProcess>;

export async function createDesktopFramedSyncTwoProcessFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-framed-sync-two-process-'));
  await fs.symlink(
    path.resolve('node_modules'),
    path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const script = path.join(root, 'desktop-framed-sync-fixture.mjs');
  await buildFixture(script);
  const left = startFixtureProcess({ deviceId: 'desktop-a', root: path.join(root, 'a'), script });
  let right = startFixtureProcess({ deviceId: 'desktop-b', root: path.join(root, 'b'), script });
  try {
    const [leftSnapshot, rightSnapshot] = await Promise.all([left.init(), right.init()]);
    return {
      left,
      leftSnapshot,
      get right() { return right; },
      rightSnapshot,
      root,
      async restartRight() {
        await right.close();
        right = startFixtureProcess({ deviceId: 'desktop-b', root: path.join(root, 'b'), script });
        return { process: right, snapshot: await right.init() };
      }
    };
  } catch (error) {
    await Promise.allSettled([left.close(), right.close()]);
    throw error;
  }
}

async function buildFixture(outputPath: string) {
  await build({
    build: {
      emptyOutDir: false,
      minify: false,
      outDir: path.dirname(outputPath),
      rolldownOptions: {
        external: (id) => id !== 'electron' && !id.startsWith('.') && !path.isAbsolute(id),
        input: 'electron/sync/desktopFramedSyncTwoProcess.fixture.ts',
        output: {
          banner: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
          codeSplitting: false,
          entryFileNames: path.basename(outputPath),
          format: 'esm'
        },
        platform: 'node'
      },
      ssr: true
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [{
      enforce: 'pre',
      name: 'desktop-framed-sync-fixture-isolation',
      resolveId(id, importer) {
        if (id === 'electron') {
          return path.resolve('electron/sync/backupRestoreSyncGroup.electron.fixture.ts');
        }
        if (importer && id.startsWith('.') && id.endsWith('.js')) {
          const source = path.resolve(path.dirname(importer), `${id.slice(0, -3)}.ts`);
          if (existsSync(source)) return source;
        }
        return null;
      }
    }],
    ssr: { noExternal: ['electron'] }
  });
}

function startFixtureProcess(input: Readonly<{ deviceId: string; root: string; script: string }>) {
  const child = fork(input.script, [], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: input.root,
      FOLIOLE_FRAMED_SYNC_DEVICE_ID: input.deviceId,
      FOLIOLE_DESKTOP_FRAMED_SYNC_PROCESS_MODULE: pathToFileURL(input.script).href
    },
    execPath: process.execPath,
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let diagnostics = '';
  let sequence = 0;
  const pending = new Map<number, PendingReply>();
  child.stdout?.on('data', (data) => { diagnostics += String(data); });
  child.stderr?.on('data', (data) => { diagnostics += String(data); });
  child.on('message', (value: FixtureReply) => {
    const reply = pending.get(value.id);
    if (!reply) return;
    pending.delete(value.id);
    if (value.error) reply.reject(new Error(value.error));
    else reply.resolve(value.result);
  });
  child.on('exit', (code, signal) => {
    for (const reply of pending.values()) {
      reply.reject(new Error(`fixture_exited:${code ?? signal}\n${diagnostics}`));
    }
    pending.clear();
  });
  const send = (action: string, args: Readonly<Record<string, unknown>> = {}) =>
    new Promise<unknown>((resolve, reject) => {
      if (!child.connected) { reject(new Error(`fixture_unavailable\n${diagnostics}`)); return; }
      const id = ++sequence;
      pending.set(id, { reject, resolve });
      child.send({ action, args, id }, (error) => {
        if (!error) return;
        pending.delete(id);
        reject(error);
      });
    });
  return {
    child,
    diagnostics: () => diagnostics, invoke: send,
    init: async () => parseSnapshot(await send('init')),
    seed: async (args: Readonly<{ content: string; nodeId: string; title: string }>) =>
      parseSnapshot(await send('seed', args)),
    seedRelationReview: async (role: 'receiver' | 'receiver_conflict' | 'sender') =>
      parseSnapshot(await send('seed_relation_review', { role })),
    seedBatch: (itemCount: number) => send('seedBatch', { itemCount }),
    snapshot: async () => parseSnapshot(await send('snapshot')),
    synchronize: (peerOrigin: string, nodeId?: string) => send('sync', { nodeId, peerOrigin }),
    synchronizeBatch: (peerOrigin: string, nodeIds: readonly string[]) =>
      send('syncBatch', { nodeIds, peerOrigin }),
    async close() {
      try { if (child.connected) await send('close'); } finally { await terminate(child); }
    }
  };
}

function parseSnapshot(value: unknown): DesktopFramedSyncFixtureSnapshot {
  if (!isRecord(value) || typeof value.databasePath !== 'string' ||
      typeof value.deviceId !== 'string' || typeof value.origin !== 'string' ||
      typeof value.pid !== 'number' || typeof value.stateRoot !== 'string') {
    throw new Error('fixture_snapshot_invalid');
  }
  return { databasePath: value.databasePath, deviceId: value.deviceId, origin: value.origin,
    pid: value.pid, stateRoot: value.stateRoot, workspace: value.workspace };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function terminate(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', () => resolve());
    child.kill();
  });
}

export function readDesktopFramedSyncLibraryEvidence(databasePath: string) {
  const sqlite = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const tableExists = (table: string) => Boolean(sqlite.prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(table));
    const count = (table: string) => tableExists(table) ? Number((sqlite.prepare(
      `SELECT COUNT(*) AS count FROM ${table}`
    ).get() as { count: number }).count) : 0;
    const states = (table: string) => tableExists(table)
      ? sqlite.prepare(`SELECT state FROM ${table} ORDER BY rowid`).all()
      : [];
    return {
      framedSync: {
        availableBlobs: count('framed_sync_available_blobs'),
        inboundFacts: count('framed_sync_inbound_facts'),
        inboundFrames: count('framed_sync_inbound_frames'),
        inboundStates: states('framed_sync_inbound_transfers'),
        outboundFrames: count('framed_sync_outbound_frames'),
        outboundHolds: count('framed_sync_outbound_holds'),
        outboundStates: states('framed_sync_outbound_publications'),
        receipts: count('framed_sync_receipts')
      },
      journalMode: sqlite.pragma('journal_mode', { simple: true }),
      nodes: sqlite.prepare(
        'SELECT id, title, content, current_version_id FROM nodes WHERE id LIKE ? ORDER BY id'
      ).all('t326-%'),
      parents: sqlite.prepare(`SELECT parent.version_id, parent.parent_version_id, parent.ordinal
        FROM node_sync_version_parents parent
        JOIN node_sync_versions version ON version.version_id = parent.version_id
        WHERE version.object_id LIKE 't326-%' ORDER BY parent.version_id, parent.ordinal`).all(),
      reviews: sqlite.prepare(`SELECT op_id, node_id, grade FROM review_log
        WHERE node_id LIKE 't326-%' ORDER BY op_id`).all(),
      versions: sqlite.prepare(
        `SELECT version_id, object_id, body_text FROM node_sync_versions
         WHERE object_id LIKE ? ORDER BY object_id, version_id`
      ).all('t326-%')
    };
  } finally {
    sqlite.close();
  }
}
