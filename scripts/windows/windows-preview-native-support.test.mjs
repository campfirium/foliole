// @vitest-environment node

import { URL } from 'node:url';

import { expect, it } from 'vitest';

import {
  isRendererSourceFile,
  isBootEventAfterIntent,
  isMatchingPreviewDelivery,
  isRuntimeFile,
  isShellConfigFile,
  isTrustedRunningStatus,
  parseWindowsClientStatus,
  selectNativePreviewAction,
  selectNativePreviewActionWithCommittedFiles
} from './windows-preview-native-support.mjs';

it('parses trusted Windows client status output', () => {
  const status = parseWindowsClientStatus(
    '[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123'
  );

  expect(status).toMatchObject({
    head: 'abc123',
    runtimePid: '501',
    status: 'RUNNING',
    trusted: true
  });
});

it('requires the expected head for trusted running status when provided', () => {
  const status = parseWindowsClientStatus(
    '[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123'
  );

  expect(isTrustedRunningStatus(status)).toBe(true);
  expect(isTrustedRunningStatus(status, { expectedHead: 'abc123' })).toBe(true);
  expect(isTrustedRunningStatus(status, { expectedHead: 'def456' })).toBe(false);
});

it('matches preview delivery to the current intent timestamp as well as nonce', () => {
  const intent = { nonce: 1, requestedAt: '2026-05-22T04:20:00.000Z' };

  expect(isMatchingPreviewDelivery({ nonce: 1, requestedAt: intent.requestedAt }, intent)).toBe(true);
  expect(isMatchingPreviewDelivery({ nonce: 1, requestedAt: '2026-05-22T04:19:00.000Z' }, intent)).toBe(false);
  expect(isMatchingPreviewDelivery({ nonce: 2, requestedAt: intent.requestedAt }, intent)).toBe(false);
});

it('matches renderer app_ready events written after the reload intent', () => {
  const intent = { requestedAt: '2026-05-22T04:20:00.000Z' };

  expect(isBootEventAfterIntent({ stage: 'app_ready', timestamp: '2026-05-22T04:20:01.000Z' }, intent)).toBe(true);
  expect(isBootEventAfterIntent({ stage: 'app_ready', timestamp: '2026-05-22T04:19:59.000Z' }, intent)).toBe(false);
  expect(isBootEventAfterIntent({ stage: 'bridge_ready', timestamp: '2026-05-22T04:20:01.000Z' }, intent)).toBe(false);
});

it('classifies native preview file groups', () => {
  expect(isShellConfigFile('vite.config.ts')).toBe(true);
  expect(isShellConfigFile('scripts/electron-dev.mjs')).toBe(true);
  expect(isShellConfigFile('scripts/electron-dev-server.mjs')).toBe(true);
  expect(isShellConfigFile('scripts/windows/electron-dev-native.mjs')).toBe(true);
  expect(isShellConfigFile('scripts/windows/start-electron-dev-native.ps1')).toBe(true);
  expect(isShellConfigFile('scripts/windows/windows-client-native.mjs')).toBe(false);
  expect(isShellConfigFile('scripts/windows/windows-client-native-stop.mjs')).toBe(false);
  expect(isShellConfigFile('scripts/windows/windows-preview-native-support.mjs')).toBe(false);
  expect(isRuntimeFile('electron/main.ts')).toBe(true);
  expect(isRuntimeFile('electron/main.test.ts')).toBe(false);
  expect(isRendererSourceFile('src/app/App.tsx')).toBe(true);
  expect(isRendererSourceFile('src/main.tsx')).toBe(true);
  expect(isRendererSourceFile('src/app/App.test.tsx')).toBe(false);
});

it('selects fallback start when no trusted runtime is running', () => {
  expect(selectNativePreviewAction({
    changedFiles: [],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime')
  })).toMatchObject({
    action: 'fallback-start',
    reason: 'Class C: no trusted running client (no-runtime)'
  });
});

it('uses restart intent for runtime changes on trusted native debug clients', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['electron/main.ts'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'restart-intent'
  });
});

it('does not full restart when the runtime is only behind committed renderer files', () => {
  expect(selectNativePreviewActionWithCommittedFiles({
    changedFiles: [],
    committedFilesSinceRuntime: ['src/app/components/SearchPalette.tsx'],
    currentHead: 'def456',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent'
  });
});

it('uses renderer reload when startup renderer files changed', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['src/app/App.tsx'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent',
    reason: 'Class A: working tree startup renderer changes detected'
  });
});

it('uses renderer reload when workspace shell renderer files changed', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['src/app/components/WorkspaceRightSidebarPanels.tsx'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent',
    reason: 'Class A: working tree startup renderer changes detected'
  });
});

it('uses renderer reload when workspace overlay entry files changed', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['src/app/components/WorkspaceSettingsOverlay.tsx'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent',
    reason: 'Class A: working tree startup renderer changes detected'
  });
});

it('uses restart intent when the runtime is behind committed electron files', () => {
  expect(selectNativePreviewActionWithCommittedFiles({
    changedFiles: [],
    committedFilesSinceRuntime: ['electron/mainStartup.ts'],
    currentHead: 'def456',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'restart-intent'
  });
});

it('uses renderer reload for renderer-only changes on trusted clients', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['src/app/components/SearchPalette.tsx'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent'
  });
});

it('does not restart the app when the native preview controller changes', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['scripts/windows/windows-client-native-stop.mjs'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'sync-only'
  });
});

it('keeps the native preview wait longer than the client healthcheck by default', async () => {
  const script = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./windows-preview-native.mjs', import.meta.url), 'utf8')
  );

  expect(script).toContain("FOLIOLE_ELECTRON_HEALTHCHECK_MS ?? '60000'");
  expect(script).toContain("WINDOWS_PREVIEW_TIMEOUT_MS ?? String(CLIENT_HEALTH_TIMEOUT_MS + 15000)");
  expect(script).toContain('!trusted.ok &&');
});
