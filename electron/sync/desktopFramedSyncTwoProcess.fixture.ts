
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { asAnchorLink } from '../ipc/commandParserAnchorLink.js';

import { editParentOrderPerformance, seedParentOrderPerformance } from './currentParentOrderPerformance.fixture.js';
import { seedCompleteInventoryFixture } from './desktopFramedSyncCompleteInventory.fixture.js';
import { createSyncCostMeasurement } from './desktopFramedSyncCost.fixture.js';
import { runDesktopFramedSyncEditCommand } from './desktopFramedSyncEdit.fixture.js';
import { initializeFixtureDatabase } from './desktopFramedSyncFixtureInitialization.js';
import { runIdentityRestoreFixtureCommand } from './desktopFramedSyncIdentityRestore.fixture.js';
import { seedLargeOverwriteFixture } from './desktopFramedSyncLargeOverwrite.fixture.js';
import { runDesktopFramedSyncOrderCommand } from './desktopFramedSyncOrder.fixture.js';
import { collectDesktopFramedSyncFixtureContent } from './desktopFramedSyncRecovery.fixture.js';
import { seedDesktopFramedSyncRelationReviewScenario } from './desktopFramedSyncRelationReviewProcessScenario.js';
import { seedDesktopFramedSyncResourceCommand } from './desktopFramedSyncResourceProcessScenario.js';
import { seedRequestSyncScaleFixture } from './desktopRequestSyncScale.fixture.js';
import { runActivationFixtureCommand } from './desktopSyncGroupActivation.fixture.js';
import { beginDesktopExpiredMemberOverwrite } from './desktopSyncGroupExpiredOverwrite.js';
import { runReviewProjectionFixture } from './reviewProjection.fixture.js';

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

const requestCounts: Record<string, number> = {};
const cost = createSyncCostMeasurement();
const server = createServer((request, response) => {
  cost.observe(request, response);
  const route = new URL(request.url ?? '/', 'http://localhost');
  const label = route.searchParams.get('request') ?? route.pathname;
  requestCounts[label] = (requestCounts[label] ?? 0) + 1;
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ deviceId, pid: process.pid }));
    return;
  }
  void loadProcessPort().then(
    (port) => {
      return port.handleHttpRequest(request, response);
    },
    (error: unknown) => writeHttpError(response, error)
  );
});
cost.attach(server);

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
      fileStorage: process.env.FOLIOLE_TEST_FRAMED_FILE_STORAGE === '1',
      localOrigin: origin
    });
    if (!isProcessPort(port)) throw new Error('desktop_framed_sync_process_port_invalid');
    return port;
  })();
  return portPromise;
}

function seed(args: Readonly<Record<string, unknown>>) {
  const now = typeof args.updatedAt === 'string' ? args.updatedAt : '2026-10-05T00:00:00.000Z';
  upsertNodeSnapshot({
    anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
    content: String(args.content),
    createdAt: '2026-10-05T00:00:00.000Z',
    isTitleManual: true,
    kind: args.kind === 'item' || args.kind === 'folder' ? args.kind : 'topic',
    nodeId: String(args.nodeId),
    parentNodeId: typeof args.parentNodeId === 'string' ? args.parentNodeId : null,
    position: 0,
    reveal: null,
    title: String(args.title),
    updatedAt: now
  });
  flushDirtyNodeSyncVersions();
  return args.includeWorkspace === false ? { nodeId: String(args.nodeId) } : snapshot();
}

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

function seedRelationReview(args: Readonly<Record<string, unknown>>) {
  const role = args.role;
  if (role !== 'sender' && role !== 'receiver' && role !== 'receiver_conflict' && role !== 'review_only' && role !== 'control_events') {
    throw new Error('fixture_relation_review_role_invalid');
  }
  seedDesktopFramedSyncRelationReviewScenario(role);
  return snapshot();
}

async function run(command: Command) {
  if (command.action === 'review_projection') return runReviewProjectionFixture(command.args);
  if (command.action === 'init') {
    return initializeProcessFixture();
  }
  if (command.action.startsWith('activation_')) return runActivationFixtureCommand(command.action, command.args);
  if (command.action === 'seed_request_scale') return seedRequestSyncScaleFixture();
  if (command.action === 'request_counts') return { ...requestCounts };
  if (command.action === 'expired_overwrite') return beginDesktopExpiredMemberOverwrite();
  if (command.action === 'cost_start') return cost.start();
  if (command.action === 'cost_stop') return cost.stop();
  if (command.action === 'seed') return seed(command.args);
  if (command.action === 'seed_parent_order_performance') return seedParentOrderPerformance(command.args);
  if (command.action === 'edit_parent_order_performance') return editParentOrderPerformance(command.args);
  if (['retain_edit', 'release_edit', 'local_content_edit'].includes(command.action))
    return runDesktopFramedSyncEditCommand(command.action, command.args);
  if (['begin_identity_restore', 'publish_identity_restore', 'identity_restore_round'].includes(command.action)) {
    return runIdentityRestoreFixtureCommand(command.action, command.args, { deviceId, stateRoot });
  }
  if (command.action === 'seed_resource') return seedDesktopFramedSyncResourceCommand(command.args);
  if (command.action === 'seed_complete_inventory') return seedCompleteInventoryFixture(Number(command.args.count), Number(command.args.bodyBytes ?? 8192));
  if (command.action === 'seed_large_overwrite') return seedLargeOverwriteFixture();
  if (['reorder', 'standalone_edit', 'rejoin', 'register_order_member', 'restore_local_order'].includes(command.action)) {
    return runDesktopFramedSyncOrderCommand(command.action, command.args);
  }
  if (command.action === 'collect_content') return collectDesktopFramedSyncFixtureContent();
  if (command.action === 'snapshot') return snapshot();
  if (command.action === 'round') return (await loadProcessPort()).round(command.args.input);
  if (command.action === 'seed_relation_review') return seedRelationReview(command.args);
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
    await runActivationFixtureCommand('activation_stop', {});
    await closeFixtureServer();
    closeDatabaseConnection();
    return null;
  }
  throw new Error(`fixture_action_unknown:${command.action}`);
}

function closeFixtureServer() {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
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

async function initializeProcessFixture() {
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
