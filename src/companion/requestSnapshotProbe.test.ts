// @vitest-environment node
import { rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';

const native = vi.hoisted(() => ({
  plugin: {} as Record<string, unknown>, active: true,
  background: new Set<() => void>(), foreground: new Set<() => void>()
}));
vi.mock('@capacitor-community/sqlite', async importOriginal => ({
  ...await importOriginal<typeof import('@capacitor-community/sqlite')>(),
  CapacitorSQLite: new Proxy({}, { get: (_target, key) => native.plugin[String(key)] })
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => native.active,
  subscribeNativeAppEnteredBackground: async (callback: () => void) => {
    native.background.add(callback); return () => native.background.delete(callback);
  },
  subscribeNativeAppForeground: async (callback: () => void) => {
    native.foreground.add(callback); return () => native.foreground.delete(callback);
  }
}));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: new Proxy({}, { get: (_target, key) => native.plugin[String(key)] })
}));

import { runRequestSnapshotProbe } from './requestSnapshotProbe';

it.each([
  { platform: 'android', earlyResume: false },
  { platform: 'ios', earlyResume: false },
  { platform: 'ios', earlyResume: true },
  { platform: 'android', earlyResume: false, pausedStillActive: true }
] as const)('$platform generates a stable snapshot and waits for active state (earlyResume=$earlyResume)', { meta: { calibratedMs: 30_000 } }, async scenario => {
  const { platform, earlyResume } = scenario;
  const pausedStillActive = 'pausedStillActive' in scenario;
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-snapshot-probe-'));
  const fixture = requestSnapshotNativeFixture(root);
  native.plugin = fixture.plugin;
  native.active = true;
  const anyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
  if (platform === 'android') Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
  const phases: string[] = [];
  let resumed = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await runRequestSnapshotProbe(platform, phase => {
      phases.push(phase);
      if (phase === 'await-background') {
        native.active = pausedStillActive;
        for (const notify of native.background) notify();
      }
      if (phase === 'cancelled') {
        if (pausedStillActive) {
          resumeTimer = setTimeout(() => {
            resumed = true;
            for (const notify of native.foreground) notify();
          }, 20);
        } else if (earlyResume) {
          queueMicrotask(() => {
            for (const notify of native.foreground) notify();
            setTimeout(() => {
              native.active = true;
              for (const notify of native.foreground) notify();
            }, 20);
          });
        } else {
          native.active = true;
          for (const notify of native.foreground) notify();
        }
      }
      if (phase === 'recover' && pausedStillActive) expect(resumed).toBe(true);
    });
    expect(result).toMatchObject({ originalVersions: 48, recoveredVersions: 50, cancelled: true });
    expect(result.writeTimes).toHaveLength(2);
    expect(phases).toEqual(['concurrent-write', 'prepare-cancellation', 'await-background', 'cancelled', 'recover']);
    expect(fixture.connections.size).toBe(0);
    expect(fixture.databases.size).toBe(0);
    expect(native.background.size).toBe(0);
    expect(native.foreground.size).toBe(0);
  } finally {
    clearTimeout(resumeTimer);
    if (anyDescriptor) Object.defineProperty(AbortSignal, 'any', anyDescriptor);
    fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

type Input = { database: string; readonly?: boolean; statement: string; statements: string; values: unknown[] };

/** Only the OS plugin boundary is substituted; production owner, SQL, snapshots and request generation run unchanged. */
function requestSnapshotNativeFixture(root: string) {
  const connections = new Map<string, Database.Database>();
  const databases = new Set<string>();
  const files = new Map<string, string>();
  const key = (input: Pick<Input, 'database' | 'readonly'>) => `${input.database}:${input.readonly === true}`;
  const connection = (input: Input) => {
    const db = connections.get(key(input));
    if (!db) throw new Error('Missing native connection');
    return db;
  };
  const plugin = {
    async isDatabase(input: Input) { return { result: databases.has(input.database) }; },
    async createConnection(input: Input) {
      if (!input.database.startsWith('request_snapshot_')) throw new Error('Non-scratch database');
      const db = new Database(path.join(root, `${input.database}.db`), { readonly: input.readonly });
      connections.set(key(input), db);
      databases.add(input.database);
    },
    async closeConnection(input: Input) {
      const db = connection(input);
      if (db.open) db.close();
      connections.delete(key(input));
    },
    async deleteDatabase(input: Input) {
      // Native plugins require a registered RW connection, even after the owner closes.
      const db = connection(input);
      expect([...connections.keys()]).toEqual([key(input)]);
      if (db.open) db.close();
      rmSync(path.join(root, `${input.database}.db`));
      databases.delete(input.database);
    },
    async open() {},
    async isDBOpen() { return { result: true }; },
    async getUrl(input: Input) { return { url: path.join(root, `${input.database}.db`) }; },
    async query(input: Input) {
      const db = connection(input);
      if (/^(BEGIN|ROLLBACK)/u.test(input.statement)) {
        db.exec(input.statement); return { values: [] };
      }
      return createFakeCapacitorConnection(db).query(input.statement, input.values);
    },
    async run(input: Input) { return createFakeCapacitorConnection(connection(input)).run(input.statement, input.values); },
    async execute(input: Input) { return createFakeCapacitorConnection(connection(input)).execute(input.statements); },
    async executeSet(input: Input & { set: { statement: string; values: unknown[][] }[] }) {
      return createFakeCapacitorConnection(connection(input)).executeSet(input.set);
    },
    async beginTransaction(input: Input) { connection(input).exec('BEGIN'); },
    async commitTransaction(input: Input) { connection(input).exec('COMMIT'); },
    async rollbackTransaction(input: Input) { connection(input).exec('ROLLBACK'); },
    async configureFramedSyncPayloadBudget() {},
    async closeFramedSyncPayloadBudget() {},
    accessFramedSyncFile: scratchFiles(files)
  };
  return { plugin, connections, databases, close() {
    for (const db of connections.values()) if (db.open) db.close();
    connections.clear();
  } };
}

function scratchFiles(files: Map<string, string>) {
  return async (input: { key: string; operation: string; base64?: string }) => {
      if (input.operation === 'write') files.set(input.key, input.base64 ?? '');
      if (input.operation === 'read') return { base64: files.get(input.key) ?? null };
      if (input.operation === 'remove') for (const name of files.keys()) {
        if (name === input.key || name.startsWith(`${input.key}/`)) files.delete(name);
      }
      if (input.operation === 'list') return { entries: [...files.keys()].filter(name => name.startsWith(`${input.key}/`)) };
      return {};
    };
}
