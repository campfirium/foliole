// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WebContents } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-tool-permission-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return false;
    },
    getPath: () => mockedAppDataDir,
    getAppPath: () => '/tmp/foliole-app-root',
    getVersion: () => '0.6.5-test'
  }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

const notifyWorkspaceContentChanged = vi.hoisted(() => vi.fn());
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged }));

vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter() {
    return {
      dispose: vi.fn(),
      getStatus: vi.fn(),
      sendMessage: adapterSendMessage
    };
  })
}));

import { normalizeAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import type { NativeAssistantTurnEvent } from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { AGENT_CONTROL_CAPABILITIES, AGENT_CONTROL_PROTOCOL_VERSION } from '../agentControl/agentControlTypes.js';
import { AIDE_LOCAL_READ_TOOLS } from '../assistant/aideLocalReadTools.js';
import { executeAideTool } from '../assistant/aideToolExecutor.js';
import { createAideToolSession } from '../assistant/aideToolSession.js';
import { closeAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { listDives } from '../database/diveRepository.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-tool-permissions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  notifyWorkspaceContentChanged.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeAssistantHistoryConnection();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});
const BOOK = `# The Wealth of Nations\n\n${'Opening words. '.repeat(40)}The division of labour raises output.\n\n${'Closing words. '.repeat(40)}`;
const QUOTE = 'The division of labour raises output.';

function seedBookWithExcerpts() {
  const { sqlite } = openDatabaseConnection();
  const from = BOOK.indexOf(QUOTE);
  const insert = sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'now', 'now')`);
  sqlite.prepare("INSERT OR REPLACE INTO settings VALUES ('host_name', 'test-host', 'now')").run();
  bindParentOrderWriter(createBetterSqlite3Driver(sqlite), { deviceAnchor: 'test-host', libraryPath: tempRoot });
  insert.run('folder', null, 'folder', 'Books', '', null);
  insert.run('book', 'folder', 'topic', 'The Wealth of Nations', BOOK, null);
  insert.run('excerpt', 'book', 'topic', 'Division of labour', QUOTE,
    JSON.stringify({ id: 'a1', kind: 'highlight', locator: { from, originalText: QUOTE, to: from + QUOTE.length } }));
  insert.run('highlight', 'excerpt', 'topic', 'Raises output', 'raises output',
    JSON.stringify({ id: 'a2', kind: 'highlight', locator: { from: 26, originalText: 'raises output', to: 39 } }));
  return from;
}

function payload(result: Awaited<ReturnType<typeof AIDE_LOCAL_READ_TOOLS[string]>>) {
  return result.payload as Record<string, unknown>;
}

it('saves the AI permission settings per device and hands the next reply its switches and budget', async () => {
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSaveToolPermissions, {
    settings: { read: { home: false, trash: false }, readBudget: 5_000 }
  });
  const loaded = await handleAssistantCommand(NATIVE_COMMANDS.assistantLoadToolPermissions, {});
  expect(loaded).toMatchObject({ read: { current: true, home: false, trash: false }, readBudget: 5_000 });

  adapterSendMessage.mockResolvedValue({ message: { text: 'ok', threadId: 'thread-1', turnId: 'turn-1' }, provider: 'codex-app-server', state: 'ready' });
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Hello',
    openingLocation: { type: 'workspace' },
    provider: 'codex-app-server'
  });
  const session = adapterSendMessage.mock.calls[0]?.[0]?.toolSession;
  expect([...session.disabledTools]).toEqual([]);
  expect(session).toMatchObject({ readBudget: 5_000, readScope: { currentIds: [], scopes: { current: true, home: false, trash: false } }, readUsed: 0 });
});

it('reads a long material in segments whose positions continue where the last one stopped', async () => {
  seedBookWithExcerpts();
  const first = payload(await AIDE_LOCAL_READ_TOOLS.read_material!({ id: 'book', length: 300 }));
  const material = first.material as Record<string, unknown>;
  expect(material).toMatchObject({ content_char_count: BOOK.length, content_end: 300, content_offset: 0, content_truncated: true });
  expect(material.children).toEqual([expect.objectContaining({ id: 'excerpt' })]);
  const next = payload(await AIDE_LOCAL_READ_TOOLS.read_material!({ id: 'book', length: 300, offset: 300 })).material as Record<string, unknown>;
  expect(String(material.content) + String(next.content)).toBe(BOOK.slice(0, 600));
  expect(next).not.toHaveProperty('children');
});

it('finds text inside a material and returns positions that point back into it', async () => {
  const from = seedBookWithExcerpts();
  const result = payload(await AIDE_LOCAL_READ_TOOLS.search_in_material!({ id: 'book', query: 'division of labour' }));
  expect(result).toMatchObject({ kind: 'text', total: 1 });
  const start = from + 'The '.length;
  expect(result.matches).toEqual([expect.objectContaining({ from: start, to: start + 'division of labour'.length })]);
});

it('finds the Base Topic of a highlight through its excerpt', async () => {
  const from = seedBookWithExcerpts();
  const result = payload(await AIDE_LOCAL_READ_TOOLS.trace_source!({ id: 'highlight' }));
  expect(result.derivation_path).toEqual([
    expect.objectContaining({ id: 'highlight', parent_id: 'excerpt', position_in_parent: { from: 26, to: 39 }, quoted_text: 'raises output' }),
    expect.objectContaining({ id: 'excerpt', parent_id: 'book', position_in_parent: { from, to: from + QUOTE.length }, quoted_text: QUOTE })
  ]);
  expect(result.base_topic).toMatchObject({ folder_path: ['Books'], focus_position: { from, to: from + QUOTE.length }, id: 'book' });
  expect(result.base_topic_materials).toEqual({
    materials: [expect.objectContaining({ id: 'excerpt', parent_id: 'book' }), expect.objectContaining({ id: 'highlight', parent_id: 'excerpt' })],
    truncated: false
  });
});

it('reports a material without PDF text instead of reading a page', async () => {
  seedBookWithExcerpts();
  const result = await AIDE_LOCAL_READ_TOOLS.read_pdf_page!({ id: 'book', page: 1 });
  expect(result).toEqual({ ok: false, payload: { error: 'pdf_text_unavailable', status: 'unavailable' } });
});

const descriptor = {
  capabilities: [...AGENT_CONTROL_CAPABILITIES],
  endpoint: 'http://127.0.0.1:1',
  pid: 1,
  protocol_version: AGENT_CONTROL_PROTOCOL_VERSION as 1,
  runtime_identity: { boot_id: 'boot', database_device_id_hash: null, pid: 1, started_at: 'now' },
  started_at: 'now',
  token: 'secret'
};

async function callDiveTool(tool: string, args: Record<string, unknown>, write: Record<string, boolean> = {}) {
  const session = createAideToolSession(normalizeAideToolPermissionSettings({ askBeforeWrite: false, write }));
  const result = await executeAideTool({ arguments: args, tool }, { descriptor, session });
  return { ...result, payload: JSON.parse(result.contentItems[0]?.text ?? '{}') as Record<string, unknown> };
}

it('creates, fills, trims and renames a Dive in the library through the Aide Dive tools', async () => {
  seedBookWithExcerpts();
  const created = await callDiveTool('create_dive', { source_ids: ['book'], title: 'Economics' });
  expect(created.payload).toMatchObject({ dive: { source_ids: ['book'] } });
  const id = (created.payload.dive as { id: string }).id;
  expect((await callDiveTool('add_dive_sources', { id, source_ids: ['folder'] })).payload.dive)
    .toMatchObject({ source_ids: ['book', 'folder'] });
  expect((await callDiveTool('remove_dive_sources', { id, source_ids: ['book'] })).payload.dive)
    .toMatchObject({ source_ids: ['folder'] });
  await callDiveTool('rename_dive', { id, title: 'Classical economics' });

  const { sqlite } = openDatabaseConnection();
  expect(listDives(sqlite)).toEqual([{ directSourceIds: ['folder'], id, title: 'Classical economics' }]);
  expect((await callDiveTool('list_dives', {})).payload).toEqual({ dives: [{ id, source_ids: ['folder'], title: 'Classical economics' }] });
  expect(sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'book'").pluck().get()).toBe('folder');
  expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(4);
});

it('refuses Dive changes when Manage Dives is off and reports unavailable sources without writing', async () => {
  seedBookWithExcerpts();
  const refused = await callDiveTool('create_dive', { title: 'Economics' }, { manageDives: false });
  expect(refused.payload).toEqual({ error: 'tool_disabled' });
  const missing = await callDiveTool('create_dive', { source_ids: ['missing'], title: 'Economics' });
  expect(missing).toMatchObject({ payload: { error: 'source_unavailable' }, success: false });
  expect((await callDiveTool('rename_dive', { id: 'nope', title: 'X' })).payload).toEqual({ error: 'dive_not_found' });
  expect(listDives(openDatabaseConnection().sqlite)).toEqual([]);
  expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();
});

// One reply in which the model asks to create a Dive, with "ask before changing" on (the default).
function startReplyThatCreatesDive() {
  const events: NativeAssistantTurnEvent[] = [];
  const sender = {
    isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn(),
    send: (_channel: string, event: NativeAssistantTurnEvent) => events.push(event)
  } as unknown as WebContents;
  const toolResults: Array<Awaited<ReturnType<typeof executeAideTool>>> = [];
  adapterSendMessage.mockImplementation(async (input: { toolSession: ReturnType<typeof createAideToolSession> }) => {
    toolResults.push(await executeAideTool(
      { arguments: { source_ids: ['book'], title: 'Economics' }, tool: 'create_dive' },
      { descriptor, session: input.toolSession }
    ));
    return { message: { text: 'ok', threadId: 'thread-1', turnId: 'turn-1' }, provider: 'codex-app-server', state: 'ready' };
  });
  const reply = handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Make a Dive', openingLocation: { type: 'workspace' }, provider: 'codex-app-server'
  }, sender);
  return { events, reply, toolResults };
}

async function waitForApproval(events: NativeAssistantTurnEvent[]) {
  await vi.waitFor(() => expect(events.some((event) => event.kind === 'approval_requested')).toBe(true));
  return events.find((event) => event.kind === 'approval_requested')!.approval!;
}

it('shows the change in the conversation and writes nothing until the person allows it', async () => {
  seedBookWithExcerpts();
  const { events, reply, toolResults } = startReplyThatCreatesDive();
  const approval = await waitForApproval(events);
  expect(approval.changes).toEqual([{
    details: [{ field: 'materials', value: 'The Wealth of Nations' }], target: 'Economics', tool: 'create_dive'
  }]);
  expect(listDives(openDatabaseConnection().sqlite)).toEqual([]);

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantResolveWriteApproval, { approvalId: approval.id, approved: true }))
    .resolves.toEqual({ resolved: true });
  await reply;
  expect(toolResults[0]?.success).toBe(true);
  expect(listDives(openDatabaseConnection().sqlite)).toEqual([expect.objectContaining({ directSourceIds: ['book'], title: 'Economics' })]);
});

it('writes nothing when the person declines the change', async () => {
  seedBookWithExcerpts();
  const { events, reply, toolResults } = startReplyThatCreatesDive();
  const approval = await waitForApproval(events);
  await handleAssistantCommand(NATIVE_COMMANDS.assistantResolveWriteApproval, { approvalId: approval.id, approved: false });
  await reply;
  expect(JSON.parse(toolResults[0]?.contentItems[0]?.text ?? '{}')).toMatchObject({ error: 'write_declined' });
  expect(listDives(openDatabaseConnection().sqlite)).toEqual([]);
  expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantResolveWriteApproval, { approvalId: approval.id, approved: true }))
    .resolves.toEqual({ resolved: false });
});
