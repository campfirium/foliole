// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertFormalMacosA5Action, assertRegisteredMacosA5Action
} from './macos-a5-action-registry.mjs';

it('keeps build and status outside the fixed A5 mutation lease', () => {
  expect(assertRegisteredMacosA5Action('build')).toMatchObject({
    deviceLeaseMode: null, formalSourceClass: 'frozen-build', mutatesFixedA5: false
  });
  expect(assertRegisteredMacosA5Action('status')).toMatchObject({
    deviceLeaseMode: 'readonly-lifecycle', formalSourceClass: 'source-free-readonly',
    mutatesFixedA5: false
  });
});

it('fails formal preflight for an action without a frozen or source-free contract', () => {
  expect(() => assertFormalMacosA5Action(
    assertRegisteredMacosA5Action('sync-group-stopped-status')
  )).toThrow('unavailable');
});

it('marks only desktop-session actions for capsule Electron materialization', () => {
  expect(assertRegisteredMacosA5Action('sync-existing').requiresHiddenDesktopRuntime).toBe(true);
  expect(assertRegisteredMacosA5Action('deploy').requiresHiddenDesktopRuntime).toBe(false);
});

it.each([
  'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'leave-sync-group', 'pair-credentials', 'pair-sync',
  'sync-existing', 'sync-group-rejoin', 'sync-group-rejoin-recover',
  'sync-group-stopped-status'
])('requires the fixed A5 mutation lease for %s', (action) => {
  expect(assertRegisteredMacosA5Action(action)).toMatchObject({
    deviceLeaseMode: 'mutation',
    formalSourceClass: action === 'sync-group-stopped-status' ? 'ordinary-only' : 'frozen-build',
    mutatesFixedA5: true
  });
});
