import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { initializeFixtureDatabase } from './desktopFramedSyncFixtureInitialization.js';
import { runIdentityRestoreFixtureCommand } from './desktopFramedSyncIdentityRestore.fixture.js';
import { seedLargeOverwriteFixture } from './desktopFramedSyncLargeOverwrite.fixture.js';
import { runDesktopFramedSyncOrderCommand } from './desktopFramedSyncOrder.fixture.js';
import { collectDesktopFramedSyncFixtureContent } from './desktopFramedSyncRecovery.fixture.js';
import { seedDesktopFramedSyncRelationReviewScenario } from './desktopFramedSyncRelationReviewProcessScenario.js';
import { seedDesktopFramedSyncResourceCommand } from './desktopFramedSyncResourceProcessScenario.js';

export { createDesktopFramedSyncProcessPort } from './desktopFramedSyncProcessPort.js';

type ProcessPort = Readonly<{
  handleHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void>;
  round(input: unknown): Promise<unknown>;
  synchronize(input: Readonly<{ nodeId?: string; peerOrigin: string }>): Promise<unknown>;
}>;

type Command = Readonly<{
  action: string;
  args: Readonly<Record<string, unknown>>;
  id: number;
}>;

const stateRoot = requiredEnvironment('FOLIOLE_ELECTRON_TEST_STATE_ROOT');
const deviceId = requiredEnvironment('FOLIOLE_FRAMED_SYNC_DEVICE_ID');
let origin = '';
let portPromise: Promise<ProcessPort> | null = null;

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ deviceId, pid: process.pid }));
    return;
  }
  void loadProcessPort().then(
    (port) => port.handleHttpRequest(request, response),
    (error: unknown) => writeHttpError(response, error)
  );
});

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCommand(value: unknown): Command {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.action !== 'string' ||
      !isRecord(value.args)) throw new Error('fixture_command_invalid');
  return { action: value.action, args: value.args, id: value.id };
}

function isProcessPort(value: unknown): value is ProcessPort {
  return isRecord(value) && typeof value.handleHttpRequest === 'function' &&
    typeof value.round === 'function' &&
    typeof value.synchronize === 'function';
}

async function loadProcessPort() {
  if (portPromise) return portPromise;
  portPromise = (async () => {
    const moduleUrl = process.env.FOLIOLE_DESKTOP_FRAMED_SYNC_PROCESS_MODULE;
    if (!moduleUrl) {
      throw new Error(
        'desktop_framed_sync_process_port_missing:createDesktopFramedSyncProcessPort'
      );
    }
    const loaded: unknown = await import(moduleUrl);
    if (!isRecord(loaded) || typeof loaded.createDesktopFramedSyncProcessPort !== 'function') {
      throw new Error('desktop_framed_sync_process_factory_invalid');
    }
    const port: unknown = await loaded.createDesktopFramedSyncProcessPort({
      databasePath: openDatabaseConnection().dbPath,
      deviceId,
      localOrigin: origin
    });
    if (!isProcessPort(port)) throw new Error('desktop_framed_sync_process_port_invalid');
    return port;
  })();
  return portPromise;
}

function seed(args: Readonly<Record<string, unknown>>) {
  const now = '2026-10-05T00:00:00.000Z';
  upsertNodeSnapshot({
    anchorLink: null,
    content: String(args.content),
    createdAt: now,
    isTitleManual: true,
    kind: 'topic',
    nodeId: String(args.nodeId),
    parentNodeId: typeof args.parentNodeId === 'string' ? args.parentNodeId : null,
    position: 0,
    reveal: null,
    title: String(args.title),
    updatedAt: now
  });
  flushDirtyNodeSyncVersions();
  return snapshot();
}

function seedBatch(args: Readonly<Record<string, unknown>>) {
  const itemCount = Number(args.itemCount);
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new Error('fixture_item_count_invalid');
  for (let index = 0; index < itemCount; index += 1) {
    const nodeId = benchmarkNodeId(index);
    upsertNodeSnapshot({
      anchorLink: null,
      content: benchmarkBody(index),
      createdAt: '2026-10-05T00:00:00.000Z',
      isTitleManual: true,
      kind: 'topic',
      nodeId,
      parentNodeId: null,
      position: index,
      reveal: null,
      title: `Benchmark ${index}`,
      updatedAt: '2026-10-05T00:00:00.000Z'
    });
  }
  flushDirtyNodeSyncVersions();
  return { itemCount };
}

const benchmarkNodeId = (index: number) => `t326-benchmark-${String(index).padStart(6, '0')}`;
const benchmarkBody = (index: number) => `Benchmark article ${index}\n${
  'Stable markdown **text** and [link](https://example.invalid).\n'.repeat(16)}`;

function snapshot() {
  return {
    databasePath: openDatabaseConnection().dbPath,
    deviceId,
    origin,
    pid: process.pid,
    stateRoot,
    workspace: loadWorkspaceSnapshot({ includeBody: true })
  };
}

async function run(command: Command) {
  if (command.action === 'init') {
    await initializeFixtureDatabase(deviceId);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture_http_port_missing');
    origin = `http://127.0.0.1:${address.port}`;
    return snapshot();
  }
  if (command.action === 'seed') return seed(command.args);
  if (['begin_identity_restore', 'identity_restore_round'].includes(command.action)) {
    return runIdentityRestoreFixtureCommand(command.action, command.args, { deviceId, stateRoot });
  }
  if (command.action === 'seed_resource') return seedDesktopFramedSyncResourceCommand(command.args);
  if (command.action === 'seedBatch') return seedBatch(command.args);
  if (command.action === 'seed_large_overwrite') return seedLargeOverwriteFixture();
  if (['reorder', 'restore_order', 'standalone_edit', 'rejoin', 'register_order_member'].includes(command.action)) {
    return runDesktopFramedSyncOrderCommand(command.action, command.args);
  }
  if (command.action === 'collect_content') return collectDesktopFramedSyncFixtureContent();
  if (command.action === 'snapshot') return snapshot();
  if (command.action === 'round') return (await loadProcessPort()).round(command.args.input);
  if (command.action === 'seed_relation_review') {
    const role = command.args.role;
    if (role !== 'sender' && role !== 'receiver' && role !== 'receiver_conflict') {
      throw new Error('fixture_relation_review_role_invalid');
    }
    seedDesktopFramedSyncRelationReviewScenario(role);
    return snapshot();
  }
  if (command.action === 'sync') {
    const peerOrigin = command.args.peerOrigin;
    if (typeof peerOrigin !== 'string') throw new Error('fixture_peer_origin_invalid');
    const nodeId = typeof command.args.nodeId === 'string' ? command.args.nodeId : undefined;
    return (await loadProcessPort()).synchronize({
      ...(nodeId === undefined ? {} : { nodeId }), peerOrigin
    });
  }
  if (command.action === 'syncBatch') {
    const peerOrigin = command.args.peerOrigin;
    const nodeIds = command.args.nodeIds;
    if (typeof peerOrigin !== 'string' || !Array.isArray(nodeIds) ||
        nodeIds.some((nodeId) => typeof nodeId !== 'string')) {
      throw new Error('fixture_sync_batch_input_invalid');
    }
    const port = await loadProcessPort();
    for (const nodeId of nodeIds) await port.synchronize({ nodeId, peerOrigin });
    return { itemCount: nodeIds.length };
  }
  if (command.action === 'close') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabaseConnection();
    return null;
  }
  throw new Error(`fixture_action_unknown:${command.action}`);
}

function writeHttpError(response: ServerResponse, error: unknown) {
  response.writeHead(503, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}

process.on('message', (value: unknown) => {
  let command: Command;
  try { command = parseCommand(value); } catch (error) {
    process.send?.({ id: null, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  void run(command).then(
    (result) => process.send?.({ id: command.id, result }),
    (error: unknown) => process.send?.({
      id: command.id,
      error: error instanceof Error ? `${command.action}: ${error.stack}` : String(error)
    })
  );
});
