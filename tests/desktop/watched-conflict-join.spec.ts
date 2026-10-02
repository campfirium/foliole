import fs from 'node:fs/promises';
import process from 'node:process';

import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { freePort } from './harness/freePort';
import { expectWorkspaceShell } from './harness/settings';

type Candidate = {
  endpoint_url: string; group_display_name: string; group_id: string; group_tag: string;
  provider_device_id: string; provider_device_name: string; provider_platform: string;
};

async function invoke<T>(page: Page, command: string, args: Record<string, unknown> = {}) {
  return page.evaluate(async (input) =>
    globalThis.window?.electronAPI?.invoke(input.command, input.args), { command, args }) as Promise<T>;
}

async function syncResult(app: ElectronApplication) {
  return app.evaluate(({ app: electronApp }) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    const connection = require(pathApi.join(electronApp.getAppPath(), 'database', 'connection.js'));
    const coordinator = require(pathApi.join(electronApp.getAppPath(), 'sync', 'desktopSyncCoordinator.js'));
    const topology = require(pathApi.join(electronApp.getAppPath(), 'sync', 'desktopAnchorTopologyRole.js'));
    const routes = require(pathApi.join(electronApp.getAppPath(), 'sync', 'desktopSyncGroupRoutes.js'));
    const members = require(pathApi.join(electronApp.getAppPath(), 'sync', 'desktopSyncGroupMemberStateSession.js'));
    const groupStore = require(pathApi.join(electronApp.getAppPath(), 'database', 'syncGroupStore.js'));
    return connection.runWithDatabaseConnectionOwner(() => ({
      result: coordinator.loadDesktopSyncTriggerResult(),
      active: Boolean(coordinator.loadActiveDesktopSyncRun()),
      topology: topology.loadDesktopAnchorTopologyState(),
      routes: routes.loadDesktopSyncGroupRoutes(groupStore.loadDesktopSyncGroup()?.group_id ?? ''),
      endpoints: members.loadDesktopSyncGroupMemberEndpoints(groupStore.loadDesktopSyncGroup()?.group_id ?? '')
    }));
  });
}

async function expectBothSyncCompleted(provider: DesktopSession, member: DesktopSession) {
  try {
    for (const session of [provider, member]) {
      await expect.poll(() => syncResult(session.electronApp), { timeout: 60_000 })
        .toMatchObject({ result: { status: 'completed' } });
    }
  } catch (error) {
    console.log('T254 sync snapshots', JSON.stringify({
      provider: await syncResult(provider.electronApp), member: await syncResult(member.electronApp)
    }));
    throw error;
  }
}

async function sourceDecisionState(app: ElectronApplication) {
  return app.evaluate(({ app: electronApp }) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    const connection = require(pathApi.join(electronApp.getAppPath(), 'database', 'connection.js'));
    const decisions = require(pathApi.join(electronApp.getAppPath(), 'database',
      'watchedFolderConflictDecisions.js'));
    const bindings = require(pathApi.join(electronApp.getAppPath(), 'database',
      'watchedFolderBindings.js'));
    const mapping = require(pathApi.join(electronApp.getAppPath(), 'database',
      'watchedHistoricalSourceMapping.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const decision = decisions.loadWatchedFolderConflictDecisions()[0];
      if (!decision) return null;
      const visible = bindings.loadWatchedFolderBindingState().bindings.map(
        (binding: { binding_id: string }) => binding.binding_id);
      if (JSON.stringify(visible) !== JSON.stringify(decision.selected_binding_ids))
        throw new Error('Selected watched sources differ from the effective source list');
      return {
        selected: decision.selected_binding_ids,
        aliases: decision.source_alias_refs,
        resolved: decision.source_alias_refs.map((ref: string) =>
          mapping.resolveWatchedHistoricalSourceRef(ref))
      };
    });
  });
}

async function sharedFolder(testInfo: { outputPath(name: string): string }, browserName: string) {
  const folder = testInfo.outputPath(`shared-articles-${browserName}`);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

async function addWatchedSource(app: ElectronApplication, folder: string, ruleId: string) {
  await app.evaluate(async ({ app: electronApp }, input) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    const connection = require(pathApi.join(electronApp.getAppPath(), 'database', 'connection.js'));
    const bindings = require(pathApi.join(electronApp.getAppPath(), 'database', 'watchedFolderBindings.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const binding = bindings.upsertChangedWatchedFolderSource({
        actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
        id: input.ruleId, keepPreview: null, keepState: 'enabled', primaryPath: input.folder
      }, new Date().toISOString());
      if (!binding) throw new Error('Watched source unavailable');
    });
  }, { folder, ruleId });
}

async function providerCandidate(page: Page): Promise<Candidate> {
  const overview = await invoke<{ sync_group: { group_id: string } }>(page, 'create_sync_group');
  let port: number | null = null;
  await expect.poll(async () => {
    const status = await invoke<{ server_status: { port: number | null; state: string } }>(
      page, 'load_sync_group_overview'
    );
    port = status.server_status.state === 'running' ? status.server_status.port : null;
    return port;
  }).not.toBeNull();
  const endpoint = `http://127.0.0.1:${port}`;
  const found = await fetch(`${endpoint}/companion/discovery`).then((response) => response.json()) as
    Omit<Candidate, 'endpoint_url' | 'group_id'>;
  return { ...found, endpoint_url: endpoint, group_id: overview.sync_group.group_id };
}

async function discoverCandidate(app: ElectronApplication, candidate: Candidate) {
  await app.evaluate(({ app: electronApp }, value) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    const state = require(pathApi.join(electronApp.getAppPath(), 'sync', 'desktopSyncGroupJoinState.js'));
    state.saveDesktopSyncGroupCandidates([value]);
  }, candidate);
}

async function moveSelectedWatchedSource(page: Page, folder: string, ruleId: string) {
  const settings = await invoke<{ sources: Array<Record<string, unknown>> }>(
    page, 'load_import_manager_settings'
  );
  await invoke(page, 'save_import_manager_settings', { settings: {
    ...settings,
    sources: [...settings.sources, {
      actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
      id: ruleId, keepPreview: null, keepState: 'enabled', primaryPath: folder
    }]
  } });
}

async function expectSelectedPathPropagated(providerPage: Page, memberPage: Page,
  selectedId: string, nextFolder: string) {
  await fs.mkdir(nextFolder, { recursive: true });
  const providerState = await invoke<{
    bindings: Array<{ binding_id: string; owner_device_identity_key: string }>;
    current_device_identity_key: string;
  }>(providerPage, 'load_watched_folder_bindings');
  const selected = providerState.bindings.find((binding) => binding.binding_id === selectedId);
  if (!selected) throw new Error('Selected watched source is missing');
  const providerOwns = selected.owner_device_identity_key === providerState.current_device_identity_key;
  const ownerPage = providerOwns ? providerPage : memberPage;
  const otherPage = providerOwns ? memberPage : providerPage;
  await moveSelectedWatchedSource(ownerPage, nextFolder, providerOwns ? 'provider-rule' : 'member-rule');
  await expect.poll(async () => {
    const state = await invoke<{ bindings: Array<{ primary_path: string }> }>(
      otherPage, 'load_watched_folder_bindings'
    );
    return state.bindings.some((binding) => binding.primary_path === nextFolder);
  }).toBe(true);
}

for (const savingSide of ['member', 'provider'] as const) test(
  `${savingSide} can resolve a join conflict and close both dialogs`, async ({ browserName }, testInfo) => {
    const folder = await sharedFolder(testInfo, browserName);
    const providerPort = await freePort();
    const memberPort = await freePort();
    let provider: DesktopSession | null = null;
    let member: DesktopSession | null = null;
    try {
      provider = await launchDesktopSession({ env: {
        ...process.env, FOLIOLE_COMPANION_SYNC_PORT: String(providerPort),
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('provider-state')
      } });
      member = await launchDesktopSession({ env: {
        ...process.env, FOLIOLE_COMPANION_SYNC_PORT: String(memberPort),
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('member-state')
      } });
      const providerPage = provider.firstWindow;
      const memberPage = member.firstWindow;
      await expectWorkspaceShell(providerPage);
      await expectWorkspaceShell(memberPage);
      const candidate = await providerCandidate(providerPage);
      await addWatchedSource(provider.electronApp, folder, 'provider-rule');
      await addWatchedSource(member.electronApp, folder, 'member-rule');
      await invoke(memberPage, 'enable_companion_sync');
      await discoverCandidate(member.electronApp, candidate);
      await invoke(memberPage, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url, mode: 'merge' });
      let requestId: string | null = null;
      await expect.poll(async () => {
        const state = await invoke<{ join_requests: Array<{ request_id: string }> }>(
          providerPage, 'load_sync_group_overview'
        );
        requestId = state.join_requests[0]?.request_id ?? null;
        return requestId;
      }).not.toBeNull();
      await invoke(providerPage, 'accept_sync_group_join_request', { request_id: requestId });
      await invoke(memberPage, 'complete_sync_group_join');

      const title = /Resolve watched folder conflicts|监听文件夹冲突处理/;
      const memberDialog = memberPage.getByRole('dialog', { name: title });
      const providerDialog = providerPage.getByRole('dialog', { name: title });
      await expect(memberDialog).toBeVisible();
      await expect(providerDialog).toBeVisible();
      const savingDialog = savingSide === 'member' ? memberDialog : providerDialog;
      await savingDialog.getByRole('checkbox').first().check();
      await savingDialog.getByRole('button', { name: /Save choices|保存选择/ }).click();
      await expect(memberDialog).toHaveCount(0);
      await expect(providerDialog).toHaveCount(0);

      await expectBothSyncCompleted(provider, member);
      const providerSources = await sourceDecisionState(provider.electronApp);
      const memberSources = await sourceDecisionState(member.electronApp);
      expect(providerSources).toEqual(memberSources);
      expect(providerSources?.selected).toHaveLength(1);
      expect(providerSources?.aliases.length).toBeGreaterThan(0);
      expect(providerSources?.resolved).toEqual(providerSources?.aliases.map(() =>
        `watched:${providerSources.selected[0]}`));
      const nextFolder = testInfo.outputPath('selected-moved-articles');
      await expectSelectedPathPropagated(providerPage, memberPage, providerSources?.selected[0] ?? '', nextFolder);
    } finally {
      await member?.close();
      await provider?.close();
    }
  }
);
