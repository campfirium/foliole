import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';
import { app } from 'electron';

import { UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS } from
  '../../lib/core/database/syncGroupUnifiedSchemaStatements.js';
import { SyncGroupLifecycleStore } from '../../lib/core/sync/syncGroupLifecycleStore.js';
import { SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN } from '../../lib/platform/syncGroupLifecycleContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { encryptCompanionPairingSecret } from './companionPairingEncryption.js';
import { SyncGroupAuthorizationStore } from './syncGroupAuthorizationStore.js';
import { InactiveSyncGroupLifecycleEndpoints } from './syncGroupLifecycleEndpoints.js';

const ROOT = requiredEnvironment('FOLIOLE_SYNC_GROUP_LIFECYCLE_ARTIFACT_ROOT');
const REPO_ROOT = requiredEnvironment('FOLIOLE_SYNC_GROUP_LIFECYCLE_REPO_ROOT');
const REVISION = requiredEnvironment('FOLIOLE_SYNC_GROUP_LIFECYCLE_REVISION');
const PORT = Number(requiredEnvironment('FOLIOLE_SYNC_GROUP_LIFECYCLE_PORT'));
const REQUEST_ID = 'request-ios-lifecycle-acceptance';
const GROUP_ID = 'group-lifecycle-acceptance';
const MANAGER_ID = 'member-manager-acceptance';
const ROUTE_ID = 'route-ios-lifecycle-acceptance';
const NOW = '2026-08-26T03:00:00.000Z';
const Database = createRequire(path.join(REPO_ROOT, 'package.json'))('better-sqlite3') as typeof BetterSqlite3;

app.setPath('userData', path.join(ROOT, 'manager-user-data'));

void app.whenReady().then(start).catch(fail);

async function start() {
  fs.mkdirSync(ROOT, { recursive: true });
  const sqlite = new Database(path.join(ROOT, 'manager.sqlite'));
  sqlite.pragma('foreign_keys = ON');
  for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  seedManager(sqlite);
  const db = createBetterSqliteDbPort(sqlite, { name: 't151-lifecycle-manager' });
  const lifecycle = new SyncGroupLifecycleStore(db);
  const endpoints = new InactiveSyncGroupLifecycleEndpoints(db, MANAGER_ID, 'manager');
  const routes = new SyncGroupAuthorizationStore(path.join(ROOT, 'manager-routes.bin'));
  let secretAbsentFromRouteStore: boolean | null = null;
  const server = http.createServer((request, response) => {
    void handle(request, response, { endpoints, lifecycle, routes,
      secretAbsent: () => secretAbsentFromRouteStore,
      setSecretAbsent: (value: boolean) => { secretAbsentFromRouteStore = value; } })
      .catch((error) => send(response, 500, { error: message(error) }));
  });
  server.listen(PORT, '127.0.0.1', () => {
    writeJson('manager-ready.json', { accepted_tip: REVISION,
      endpoint: `http://127.0.0.1:${PORT}`, manager_database: sqlite.name, status: 'ready' });
  });
  const stop = () => server.close(() => { sqlite.close(); app.exit(0); });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

interface HandlerContext {
  endpoints: InactiveSyncGroupLifecycleEndpoints;
  lifecycle: SyncGroupLifecycleStore;
  routes: SyncGroupAuthorizationStore;
  secretAbsent(): boolean | null;
  setSecretAbsent(value: boolean): void;
}

async function handle(
  request: http.IncomingMessage, response: http.ServerResponse, context: HandlerContext
) {
  if (request.method === 'OPTIONS') return send(response, 204, {});
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (request.headers['x-foliole-lifecycle-prepare'] !== SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN) {
    return send(response, 403, { error: 'lifecycle_prepare_only' });
  }
  if (request.method === 'POST' && url.pathname === '/v4/join-applications') {
    const result = await context.endpoints.receiveJoinApplication(
      SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN, await readJson(request));
    return send(response, result.status, result.body);
  }
  if (request.method === 'GET' && url.pathname === `/v4/join-applications/${REQUEST_ID}`) {
    const application = await context.lifecycle.loadJoinApplication(REQUEST_ID);
    const grant = await context.lifecycle.loadRouteGrantForRequest(REQUEST_ID);
    const roster = await context.lifecycle.loadRoster(GROUP_ID);
    return send(response, application ? 200 : 404,
      application ? { application, grant, roster } : { error: 'join_application_not_found' });
  }
  if (request.method === 'POST' && url.pathname === `/fixture/approve/${REQUEST_ID}`) {
    return approve(response, context);
  }
  if (request.method === 'GET' && url.pathname === '/fixture/receipt') {
    return send(response, 200, await receipt(context));
  }
  if (request.method === 'POST' && url.pathname === '/fixture/shutdown') {
    send(response, 200, { status: 'stopping' });
    return setImmediate(() => app.quit());
  }
  return send(response, 404, { error: 'fixture_route_not_found' });
}

async function approve(response: http.ServerResponse, context: HandlerContext) {
  const application = await context.lifecycle.loadJoinApplication(REQUEST_ID);
  if (!application) return send(response, 404, { error: 'join_application_not_found' });
  const secret = randomBytes(32).toString('base64url');
  const encrypted = await encryptCompanionPairingSecret({
    clientPublicKey: application.application_public_key, credentialSecret: secret
  });
  const snapshot = context.routes.snapshot();
  context.routes.save({ authorization_epoch: 1, authorization_id: 'authorization-ios-lifecycle-1',
    endpoint_hint: `http://127.0.0.1:${PORT}`, group_id: GROUP_ID, kind: 'verification',
    local_member_id: MANAGER_ID, peer_member_id: 'member-ios-lifecycle-acceptance',
    protocol_version: 4, route_id: ROUTE_ID, state: 'active' }, secret);
  try {
    const result = await context.endpoints.approveJoinApplication(SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN, {
      authorization_id: 'authorization-ios-lifecycle-1', encrypted_route_secret: { ...encrypted },
      grant_id: 'grant-ios-lifecycle-acceptance', member_id: 'member-ios-lifecycle-acceptance',
      now: NOW, request_id: REQUEST_ID, route_id: ROUTE_ID
    });
    context.setSecretAbsent(!fs.readFileSync(context.routes.storePath).includes(Buffer.from(secret)));
    return send(response, result.status, result.body);
  } catch (error) {
    context.routes.restore(snapshot);
    throw error;
  }
}

async function receipt(context: HandlerContext) {
  const application = await context.lifecycle.loadJoinApplication(REQUEST_ID);
  const grant = await context.lifecycle.loadRouteGrantForRequest(REQUEST_ID);
  const roster = await context.lifecycle.loadRoster(GROUP_ID);
  return { accepted_tip: REVISION, application, grant,
    manager_route: context.routes.load(ROUTE_ID, 'verification'),
    production_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version, roster,
    route_secret_absent_from_store: context.secretAbsent(), status: 'passed' };
}

function seedManager(sqlite: BetterSqlite3.Database) {
  sqlite.prepare(`INSERT INTO sync_groups
    (group_id, timeline_id, display_name, manager_member_id, roster_revision, state, created_at, updated_at)
    VALUES (?, 'timeline-lifecycle-acceptance', 'Lifecycle acceptance', ?, 0, 'active', ?, ?)`)
    .run(GROUP_ID, MANAGER_ID, NOW, NOW);
  sqlite.prepare(`INSERT INTO sync_group_members
    (group_id, member_id, installation_id, display_name, host_platform, role, state, identity_state,
     authorization_id, authorization_epoch, joined_at, updated_at)
    VALUES (?, ?, 'installation-manager-acceptance', 'Acceptance manager', 'darwin', 'manager',
      'active', 'verified', 'authorization-manager-acceptance', 1, ?, ?)`).run(GROUP_ID, MANAGER_ID, NOW, NOW);
  sqlite.prepare(`INSERT INTO sync_group_member_authorizations
    (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
    VALUES (?, ?, 'authorization-manager-acceptance', 1, 'active', ?)`).run(GROUP_ID, MANAGER_ID, NOW);
  sqlite.prepare(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_member_id, installation_id, member_state, updated_at)
    VALUES (1, ?, ?, 'installation-manager-acceptance', 'active', ?)`).run(GROUP_ID, MANAGER_ID, NOW);
}

function send(response: http.ServerResponse, status: number, value: object) {
  response.writeHead(status, { 'Access-Control-Allow-Headers': 'Content-Type, X-Foliole-Lifecycle-Prepare',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function readJson(request: http.IncomingMessage) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error('fixture_request_too_large');
  }
  return JSON.parse(body) as unknown;
}

function writeJson(name: string, value: object) {
  fs.writeFileSync(path.join(ROOT, name), `${JSON.stringify(value, null, 2)}\n`);
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function fail(error: unknown) {
  fs.mkdirSync(ROOT, { recursive: true });
  writeJson('manager-failure.json', { error: message(error), status: 'failed' });
  app.exit(1);
}
