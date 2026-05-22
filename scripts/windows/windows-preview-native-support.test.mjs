// @vitest-environment node

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
    committedFilesSinceRuntime: ['src/main.tsx'],
    currentHead: 'def456',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent'
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
    changedFiles: ['src/app/App.tsx'],
    currentHead: 'abc123',
    status: parseWindowsClientStatus('[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=abc123')
  })).toMatchObject({
    action: 'renderer-reload-intent'
  });
});
