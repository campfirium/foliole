import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { Page } from '@playwright/test';

import {
  waitForDesktopProductState
} from '../../scripts/acceptance/desktop-product-event.mjs';
import {
  createClientPairTopic, updateClientPairTopic
} from '../../scripts/desktop/client-pair-sync-content-action.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type ExactNode = { content: string; nodeId: string; title: string; updatedAt: string };
type GroupIdentity = { groupId: string; groupTag: string };
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Overview = { join_candidates: Array<{ endpoint_url: string; group_id: string; group_tag: string }>;
  join_requests: Array<{ request_id: string }>;
  sync_group: { devices: Array<{ device_id: string }>; group_id: string; group_tag: string } };

const role = required('FOLIOLE_PAIR_ROLE');
const signalRoot = required('FOLIOLE_PAIR_SIGNAL_ROOT');

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function signalPath(name: string) {
  return path.join(signalRoot, `${name}.json`);
}

async function waitSignal(name: string): Promise<Record<string, unknown>> {
  const target = signalPath(name);
  await expect.poll(() => fs.existsSync(target), { timeout: 90_000 }).toBe(true);
  return JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
}

function emit(name: string, value: unknown = {}) {
  console.log(`[client-pair] ${name}=${Buffer.from(JSON.stringify(value)).toString('base64')}`);
}

async function establishGroup(page: Page, invoke: Invoke): Promise<GroupIdentity> {
  if (role === 'owner') {
    const overview = await invoke('create_sync_group') as Overview;
    const identity = { groupId: overview.sync_group.group_id, groupTag: overview.sync_group.group_tag };
    emit('owner-ready', identity);
    await waitSignal('join-requested');
    const requested = await waitForDesktopProductState(page, {
      command: 'load_sync_group_overview', condition: { count: 1, kind: 'join-request-count' },
      eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs: 90_000
    }) as Overview;
    await invoke('accept_sync_group_join_request', {
      request_id: requested.join_requests[0].request_id
    });
    emit('owner-accepted');
    await waitSignal('join-complete');
    return identity;
  }
  if (role !== 'joiner') throw new Error(`Unsupported client-pair role: ${role}`);
  const identity = { groupId: required('FOLIOLE_PAIR_GROUP_ID'),
    groupTag: required('FOLIOLE_PAIR_GROUP_TAG') };
  await invoke('enable_companion_sync');
  const discovered = await waitForDesktopProductState(page, {
    command: 'load_sync_group_overview', condition: { ...identity, kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 90_000,
    triggerCommand: 'discover_sync_groups'
  }) as Overview;
  const candidate = discovered.join_candidates.find((item) =>
    item.group_id === identity.groupId && item.group_tag === identity.groupTag);
  if (!candidate) throw new Error('Expected Sync Group candidate was not discovered.');
  await invoke('request_sync_group_join', { endpoint_url: candidate.endpoint_url });
  emit('join-requested');
  await waitSignal('owner-accepted');
  await invoke('complete_sync_group_join');
  emit('join-complete');
  return identity;
}

async function assertJoined(page: Page, identity: GroupIdentity) {
  const joined = await waitForDesktopProductState(page, {
    command: 'load_sync_group_overview', condition: { deviceCount: 2,
      groupId: identity.groupId, kind: 'group' }, eventName: 'onSyncGroupDiscoveryChanged'
  }) as Overview;
  const deviceIds = joined.sync_group.devices.map((device) => device.device_id);
  expect(new Set(deviceIds).size).toBe(2);
  emit('joined', { deviceIds, ...identity });
  return deviceIds;
}

async function runContent(page: Page, invoke: Invoke) {
  const session = { invoke };
  const windowsCreated = await createClientPairTopic({ label: `${role}-windows`, session });
  emit('windows-created', windowsCreated);
  await waitSignal('mac-observed-windows-create');
  const windowsUpdated = await updateClientPairTopic({ expected: windowsCreated, session });
  emit('windows-updated', windowsUpdated);
  await waitSignal('mac-observed-windows-update');
  const macCreated = await waitSignal('mac-created') as unknown as ExactNode;
  await waitForDesktopProductState(page, { command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: { kind: 'exact-node', ...macCreated },
    eventName: 'onWorkspaceSyncApplied' });
  emit('mac-create-observed', macCreated);
  const macUpdated = await waitSignal('mac-updated') as unknown as ExactNode;
  await waitForDesktopProductState(page, { command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: { kind: 'exact-node', ...macUpdated },
    eventName: 'onWorkspaceSyncApplied' });
  emit('mac-update-observed', macUpdated);
  return { macCreated, macUpdated, windowsCreated, windowsUpdated };
}

test('runs one role in the standard client-pair sync contract', async ({ desktopSession }) => {
  test.setTimeout(240_000);
  const page = desktopSession.firstWindow;
  await expectWorkspaceShell(page);
  const invoke = (command: string, args?: Record<string, unknown>) =>
    page.evaluate(async ({ command, args }) => {
      if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Windows command ${command} timed out.`)), 30_000);
      });
      try {
        return await Promise.race([globalThis.electronAPI.invoke(command, args), timeout]);
      } finally {
        clearTimeout(timer!);
      }
    }, { args, command });
  const identity = await establishGroup(page, invoke);
  const deviceIds = await assertJoined(page, identity);
  const content = await runContent(page, invoke);
  await waitSignal('release');
  emit('complete', { deviceIds, ...content, ...identity });
});
