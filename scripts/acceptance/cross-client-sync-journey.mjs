import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { waitForDesktopProductState } from './desktop-product-event.mjs';
import {
  createClientPairTopic, distinctClientPairDeviceIds, updateClientPairTopic
} from '../desktop/client-pair-sync-content-action.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WORKSPACE = /^(Foliole workspace|Foliole 工作区)$/;

function required(value, label) {
  if (!value?.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function parseJourneyConfig(argv) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, options: {
    'artifact-root': { type: 'string' }, instance: { type: 'string' },
    'mac-cdp': { type: 'string' }, revision: { type: 'string' },
    'windows-cdp': { type: 'string' }
  }, strict: true });
  const instance = required(values.instance, 'instance').toLowerCase();
  if (!['a', 'b'].includes(instance)) throw new Error('instance must be a or b');
  const config = { artifactRoot: path.resolve(required(values['artifact-root'], 'artifact root')),
    instance, macCdp: required(values['mac-cdp'], 'Mac CDP'),
    revision: required(values.revision, 'revision'),
    windowsCdp: required(values['windows-cdp'], 'Windows CDP') };
  for (const endpoint of [config.macCdp, config.windowsCdp]) {
    if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/u.test(endpoint)) {
      throw new Error('CDP endpoints must use loopback HTTP');
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(config.revision)) throw new Error('revision must be a full commit hash');
  return config;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

async function connect(endpoint) {
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  const page = context.pages().find((candidate) => /^http:\/\/127\.0\.0\.1:\d+\//u.test(candidate.url()));
  if (!page) throw new Error(`Foliole workspace is unavailable at ${endpoint}`);
  page.setDefaultTimeout(90_000);
  await page.getByRole('main', { name: WORKSPACE }).waitFor({ state: 'visible' });
  return { context, page };
}

function invoke(page, command, args) {
  return page.evaluate(async ({ commandName, commandArgs }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(commandName, commandArgs);
  }, { commandArgs: args, commandName: command });
}

function groupIdentity(overview) {
  const group = overview?.sync_group;
  if (!group?.group_id || !group?.group_tag) throw new Error('Sync Group identity is missing.');
  return { groupId: group.group_id, groupTag: group.group_tag };
}

async function observeGroup(page, identity) {
  const overview = await waitForDesktopProductState(page, {
    command: 'load_sync_group_overview', condition: { deviceCount: 2,
      groupId: identity.groupId, kind: 'group' }, eventName: 'onSyncGroupDiscoveryChanged'
  });
  return { deviceIds: distinctClientPairDeviceIds(overview.sync_group.devices),
    identity: groupIdentity(overview) };
}

async function formGroup(owner, joiner) {
  await invoke(joiner, 'enable_companion_sync');
  const identity = groupIdentity(await invoke(owner, 'create_sync_group'));
  const discovered = await waitForDesktopProductState(joiner, {
    command: 'load_sync_group_overview', condition: { ...identity, kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 90_000,
    triggerCommand: 'discover_sync_groups'
  });
  const candidate = discovered.join_candidates.find((item) =>
    item.group_id === identity.groupId && item.group_tag === identity.groupTag);
  if (!candidate) throw new Error('Expected Sync Group was not discovered.');
  await invoke(joiner, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url });
  const requested = await waitForDesktopProductState(owner, {
    command: 'load_sync_group_overview', condition: { count: 1, kind: 'join-request-count' },
    eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs: 90_000
  });
  await invoke(owner, 'accept_sync_group_join_request', {
    request_id: requested.join_requests[0].request_id
  });
  await invoke(joiner, 'complete_sync_group_join');
  const ownerGroup = await observeGroup(owner, identity);
  const joinerGroup = await observeGroup(joiner, identity);
  if (JSON.stringify(ownerGroup) !== JSON.stringify(joinerGroup)) {
    throw new Error('Clients did not report the same Sync Group and devices.');
  }
  return ownerGroup;
}

function exactNode(snapshot, expected) {
  const node = snapshot.nodesById[expected.nodeId];
  return { content: node?.content, nodeId: node?.nodeId,
    title: node?.title, updatedAt: node?.updatedAt };
}

async function observeNode(page, expected) {
  const snapshot = await waitForDesktopProductState(page, {
    command: 'load_workspace_list_snapshot', commandArgs: { includePdfOpenings: false },
    condition: { kind: 'exact-node', ...expected }, eventName: 'onWorkspaceSyncApplied',
    timeoutMs: 90_000
  });
  if (JSON.stringify(exactNode(snapshot, expected)) !== JSON.stringify(expected)) {
    throw new Error(`Exact topic did not converge: ${expected.nodeId}`);
  }
}

async function verifyDirection(origin, receiver, label) {
  const session = { invoke: (command, args) => invoke(origin, command, args) };
  const created = await createClientPairTopic({ label, session });
  await observeNode(receiver, created);
  const updated = await updateClientPairTopic({ expected: created, session });
  await observeNode(receiver, updated);
  return { created, updated };
}

export async function runCrossClientJourney(argv = process.argv.slice(2)) {
  const config = parseJourneyConfig(argv);
  const root = path.join(config.artifactRoot, `instance-${config.instance}`);
  const result = { instance: config.instance.toUpperCase(), revision: config.revision,
    startedAt: new Date().toISOString() };
  let mac;
  let windows;
  try {
    mac = await connect(config.macCdp);
    windows = await connect(config.windowsCdp);
    await mac.context.tracing.start({ screenshots: true, snapshots: true });
    await windows.context.tracing.start({ screenshots: true, snapshots: true });
    const owner = config.instance === 'a' ? mac.page : windows.page;
    const joiner = config.instance === 'a' ? windows.page : mac.page;
    result.group = await formGroup(owner, joiner);
    result.macToWindows = await verifyDirection(mac.page, windows.page, `${config.instance}-mac`);
    result.windowsToMac = await verifyDirection(windows.page, mac.page, `${config.instance}-windows`);
    await mac.page.screenshot({ fullPage: true, path: path.join(root, 'mac-final.png') });
    await windows.page.screenshot({ fullPage: true, path: path.join(root, 'windows-final.png') });
    result.status = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
    result.status = 'failed';
  } finally {
    result.completedAt = new Date().toISOString();
    await mac?.context.tracing.stop({ path: path.join(root, 'mac-trace.zip') }).catch(() => undefined);
    await windows?.context.tracing.stop({ path: path.join(root, 'windows-trace.zip') }).catch(() => undefined);
    writeJson(path.join(root, 'result.json'), result);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCrossClientJourney().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`[cross-client-sync-journey] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
