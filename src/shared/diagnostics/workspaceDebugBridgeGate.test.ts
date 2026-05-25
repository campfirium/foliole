import { expect, it } from 'vitest';

import { isWorkspaceDebugEnabledForRuntime } from './workspaceDebugBridgeGate';

it('keeps writable workspace debug disabled in production unless preload explicitly allows it', () => {
  expect(isWorkspaceDebugEnabledForRuntime({ isDev: false, isTest: false, workspaceDebugBridge: false })).toBe(false);
  expect(isWorkspaceDebugEnabledForRuntime({ isDev: false, isTest: false, workspaceDebugBridge: undefined })).toBe(false);
  expect(isWorkspaceDebugEnabledForRuntime({ isDev: false, isTest: false, workspaceDebugBridge: true })).toBe(true);
});
