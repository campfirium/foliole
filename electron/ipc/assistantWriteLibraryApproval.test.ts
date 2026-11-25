// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { WebContents } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyLibraryPathOverrides, resolveLibraryPaths } from '../../lib/platform/libraryPaths.js';
import type { NativeAssistantTurnEvent } from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { deferred } from '../../src/test/deferred.js';
import { getAgentControlApiSessionDescriptor, stopAgentControlApiServer } from '../agentControl/agentControlServer.js';
import { executeAideTool, type AideToolRequest } from '../assistant/aideToolExecutor.js';
import type { AideToolSession } from '../assistant/aideToolSession.js';
import { FOLIOLE_AIDE_TOOL_PERMISSIONS_KEY, loadFolioleAideToolPermissionSettings } from '../assistant/folioleAideToolPermissionSettings.js';
import { closeAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';
import { migrateLibraryPathChange, runLibraryHomeMigration } from './libraryPathMigration.js';

const adapterSendMessage = vi.hoisted(() => vi.fn());
let root: string;
let activeLibrary: DatabaseSync;

vi.mock('electron', () => ({
  app: { getPath: () => root, getVersion: () => '0.8.2-test' },
  BrowserWindow: { getAllWindows: () => [] }
}));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: root, app_config_dir: root, app_data_dir: root, app_log_dir: root })
}));
vi.mock(import('../diagnostics/diagnosticLog.js'), { spy: true });
vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: class {
    dispose = vi.fn();
    sendMessage = adapterSendMessage;
  }
}));
vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  openDatabaseConnection: () => ({
    driver: {},
    sqlite: { prepare: () => ({ get: () => ({ kind: 'topic', title: 'Draft' }) }) }
  })
}));
vi.mock('../database/settingsStore.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  loadJsonSetting: (key: string) => {
    const row = activeLibrary.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return typeof row?.value === 'string' ? JSON.parse(row.value) : null;
  }
}));
vi.mock('../../lib/core/database/syncDeviceIdentity.js', () => ({
  loadDatabaseDeviceId: () => 'test-device'
}));
vi.mock('../externalSearchBackgroundRefreshRuntime.js', () => ({
  pauseExternalSearchBackgroundRefresh: async () => undefined
}));
vi.mock('../database/diveRepository.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  createDive: (_db: unknown, title: string) => {
    activeLibrary.prepare('INSERT INTO drafts VALUES (?)').run(title);
    return { directSourceIds: [], id: 'dive', title };
  }
}));
vi.mock('../agentControl/agentControlMaterialMutations.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  updateAgentControlMaterial: ({ id, title }: { id: string; title: string }) => {
    activeLibrary.prepare('INSERT INTO drafts VALUES (?)').run(title);
    return { id, title };
  }
}));

function seedLibrary(dbPath: string) {
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE drafts (title TEXT NOT NULL); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  return db;
}

let libraryA: DatabaseSync;
let libraryB: DatabaseSync;
let pathsA: ReturnType<typeof resolveLibraryPaths>;
let pathsB: ReturnType<typeof resolveLibraryPaths>;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'foliole-approval-switch-'));
  pathsA = resolveLibraryPaths(path.join(root, 'a'));
  pathsB = resolveLibraryPaths(path.join(root, 'b'));
  for (const paths of [pathsA, pathsB]) mkdirSync(paths.data_dir, { recursive: true });
  libraryA = seedLibrary(pathsA.database_path);
  libraryB = seedLibrary(pathsB.database_path);
  activeLibrary = libraryA;
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
});

afterEach(async () => {
  await stopAgentControlApiServer();
  // Agent Control can return its response while its diagnostic log is still writing.
  const diagnosticWrites = vi.mocked(appendDiagnosticLog);
  await Promise.allSettled(diagnosticWrites.mock.results.map(({ value }) => value));
  diagnosticWrites.mockClear();
  libraryA.close();
  libraryB.close();
  // Aide history lives under the temporary root; Windows refuses to delete it while open.
  closeAssistantHistoryConnection();
  rmSync(root, { force: true, recursive: true });
});

async function switchLibrary(beforeSwitch?: () => Promise<void>) {
  const overrides = createEmptyLibraryPathOverrides();
  await runLibraryHomeMigration(async () => {
    await beforeSwitch?.();
    await migrateLibraryPathChange({
      confirmExistingLibraryHome: true, currentOverrides: overrides, currentPaths: pathsA,
      location: 'library_home', nextOverrides: { ...overrides, library_home: pathsB.library_home }, nextPaths: pathsB
    });
    activeLibrary = libraryB;
  });
}

function startWrite(request: AideToolRequest, options: { beforeWrite?: () => Promise<void>; fetcher?: typeof fetch } = {}) {
  const events: NativeAssistantTurnEvent[] = [];
  const requested = deferred<string>();
  const sender = {
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn(),
    send: (_channel: string, event: NativeAssistantTurnEvent) => {
      events.push(event);
      if (event.approval) requested.resolve(event.approval.id);
    }
  } as unknown as WebContents;
  const write = deferred<Awaited<ReturnType<typeof executeAideTool>>>();
  adapterSendMessage.mockImplementationOnce(async ({ toolSession }: { toolSession: AideToolSession }) => {
    await options.beforeWrite?.();
    write.resolve(await executeAideTool(request, {
      descriptor: getAgentControlApiSessionDescriptor(), session: toolSession,
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    }));
    return { message: { text: 'Done' }, provider: 'codex-app-server', state: 'ready' };
  });
  const reply = handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Write a draft', openingLocation: { type: 'workspace' }, provider: 'codex-app-server'
  }, sender);
  return { approvalId: requested.promise, events, reply, write: write.promise };
}

function allow(approvalId: string) {
  return handleAssistantCommand(NATIVE_COMMANDS.assistantResolveWriteApproval, { approvalId, approved: true });
}

function titles(library: DatabaseSync) {
  return library.prepare('SELECT title FROM drafts').all().map((row) => row.title);
}

const createDive = { arguments: { title: 'Read later' }, tool: 'create_dive' };
const updateMaterial = {
  arguments: { expected_updated_at: 'now', id: 'draft', title: 'Read later' }, tool: 'update_material'
};

it('withdraws a pending approval for a Dive with no sources on switch and refuses a late Allow', async () => {
  const pending = startWrite(createDive);
  const id = await pending.approvalId;
  await switchLibrary();
  const late = await allow(id);
  await pending.reply;
  expect(titles(libraryA)).toEqual([]);
  expect(titles(libraryB)).toEqual([]);
  expect(late).toEqual({ resolved: false });
  expect(pending.events).toContainEqual(expect.objectContaining({ approvalId: id, kind: 'approval_cancelled' }));
});

it('rechecks a confirmed Dive write after the database owner switches libraries', async () => {
  const pending = startWrite(createDive);
  const id = await pending.approvalId;
  const maintenanceEntered = deferred<void>();
  const proceed = deferred<void>();
  const switching = switchLibrary(async () => {
    maintenanceEntered.resolve();
    await proceed.promise;
  });
  await maintenanceEntered.promise;
  const allowed = await allow(id);
  // Let the confirmed tool call reach the owner queue before the switch proceeds.
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  proceed.resolve();
  await switching;
  await pending.reply;
  expect(allowed).toEqual({ resolved: true });
  expect(titles(libraryA)).toEqual([]);
  expect(titles(libraryB)).toEqual([]);
  expect(await pending.write).toMatchObject({ success: false });
});

it('refuses a confirmed update that reached Agent Control only after the switch', async () => {
  const dispatched = deferred<void>();
  const deliver = deferred<void>();
  const pending = startWrite(updateMaterial, { fetcher: async (request, init) => {
    dispatched.resolve();
    await deliver.promise;
    return fetch(request, init);
  } });
  await allow(await pending.approvalId);
  await dispatched.promise;
  try {
    await switchLibrary();
  } finally {
    deliver.resolve();
  }
  await pending.reply;
  expect(titles(libraryA)).toEqual([]);
  expect(titles(libraryB)).toEqual([]);
  expect(await pending.write).toMatchObject({ success: false });
});

it('writes confirmed changes into the same library through local and Agent Control tools', async () => {
  for (const request of [createDive, updateMaterial]) {
    const pending = startWrite(request);
    expect(await allow(await pending.approvalId)).toEqual({ resolved: true });
    expect(await pending.write).toMatchObject({ success: true });
    await pending.reply;
  }
  expect(titles(libraryA)).toEqual(['Read later', 'Read later']);
  expect(titles(libraryB)).toEqual([]);
});

it.each([createDive, updateMaterial])('keeps unprompted $tool writes in their original library', async (request) => {
  libraryA.prepare('INSERT INTO settings VALUES (?, ?)').run(
    FOLIOLE_AIDE_TOOL_PERMISSIONS_KEY, JSON.stringify({ askBeforeWrite: false })
  );
  expect(loadFolioleAideToolPermissionSettings().askBeforeWrite).toBe(false);
  const sameLibrary = startWrite(request);
  expect(await Promise.race([sameLibrary.reply, sameLibrary.approvalId])).toMatchObject({ state: 'ready' });
  expect(sameLibrary.events).toEqual([]);
  expect(await sameLibrary.write).toMatchObject({ success: true });

  const started = deferred<void>();
  const proceed = deferred<void>();
  const pending = startWrite(request, { beforeWrite: async () => {
    started.resolve();
    await proceed.promise;
  } });
  expect(await Promise.race([started.promise.then(() => 'started'), pending.reply])).toBe('started');
  try {
    await switchLibrary();
    expect(loadFolioleAideToolPermissionSettings().askBeforeWrite).toBe(true);
  } finally {
    proceed.resolve();
  }
  expect(await pending.reply).toMatchObject({ state: 'ready' });
  expect(titles(libraryA)).toEqual(['Read later']);
  expect(titles(libraryB)).toEqual([]);
  expect(await pending.write).toEqual({
    contentItems: [{ text: '{"error":"library_changed"}', type: 'inputText' }], success: false
  });
});
