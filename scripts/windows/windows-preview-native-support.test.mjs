// @vitest-environment node

import { expect, it } from 'vitest';

import {
  isRendererSourceFile,
  isRuntimeFile,
  isShellConfigFile,
  isTrustedRunningStatus,
  parseWindowsClientStatus,
  selectNativePreviewAction
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

it('classifies native preview file groups', () => {
  expect(isShellConfigFile('vite.config.ts')).toBe(true);
  expect(isRuntimeFile('electron/main.ts')).toBe(true);
  expect(isRuntimeFile('electron/main.test.ts')).toBe(false);
  expect(isRendererSourceFile('src/app/App.tsx')).toBe(true);
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

it('prefers restart intent for runtime changes on trusted clients', () => {
  expect(selectNativePreviewAction({
    changedFiles: ['electron/main.ts'],
    currentHead: 'abc123',
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
