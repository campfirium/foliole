// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertFormalMacosA5Action, assertRegisteredMacosA5Action
} from './macos-a5-action-registry.mjs';

it('keeps build and status outside the fixed A5 mutation lease', () => {
  expect(assertRegisteredMacosA5Action('build')).toMatchObject({
    deviceLeaseMode: null, formalSourceClass: 'frozen-build', formalTarget: 'build-capsule',
    formalTargetIdentity: 'accepted-source-archive',
    mutatesFixedA5: false
  });
  expect(assertRegisteredMacosA5Action('status')).toMatchObject({
    deviceLeaseMode: 'readonly-lifecycle', formalSourceClass: 'source-free-readonly',
    formalTarget: 'fixed-a5', formalTargetIdentity: '87a33a4b', mutatesFixedA5: false
  });
  expect(assertRegisteredMacosA5Action('hidden-desktop-status')).toMatchObject({
    formalEvidence: { kind: 'run-json', root: 'a5-hidden-desktop-status' },
    deviceLeaseMode: null, formalSourceClass: 'frozen-build', mutatesFixedA5: false,
    formalTarget: 'hidden-desktop-runtime', requiresHiddenDesktopRuntime: true
  });
});

it('keeps action evidence layout out of the generic formal receipt', () => {
  expect(assertRegisteredMacosA5Action('system-entry-sync').formalEvidence)
    .toEqual({ kind: 'run-directory', root: 'a5-system-entry-sync' });
  expect(assertRegisteredMacosA5Action('build').formalEvidence).toEqual({ kind: 'receipt' });
});

it('fails formal preflight for an action without a frozen or source-free contract', () => {
  expect(() => assertFormalMacosA5Action(
    assertRegisteredMacosA5Action('sync-group-stopped-status')
  )).toThrow('unavailable');
});

it('marks only desktop-session actions for capsule Electron materialization', () => {
  expect(assertRegisteredMacosA5Action('sync-existing').requiresHiddenDesktopRuntime).toBe(true);
  expect(assertRegisteredMacosA5Action('system-entry-sync').requiresHiddenDesktopRuntime).toBe(true);
  expect(assertRegisteredMacosA5Action('deploy').requiresHiddenDesktopRuntime).toBe(false);
});

it('keeps two-device acceptance isolated from the installed product application', () => {
  const action = assertRegisteredMacosA5Action('single-principal-sync-group');
  expect(action.deviceLeaseMode).toBe('mutation');
  expect(action.mutatesFixedA5).toBe(false);
});

it('keeps the ordinary journey isolated from installed product data', () => {
  const action = assertRegisteredMacosA5Action('ordinary-journey');
  expect(action).toMatchObject({
    deviceLeaseMode: 'mutation', formalEvidence: {
      kind: 'run-directory', root: 'a5-ordinary-journey'
    }, formalSourceClass: 'frozen-build', mutatesFixedA5: false,
    requiresHiddenDesktopRuntime: true
  });
});

it.each([
  'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'leave-sync-group', 'pair-credentials',
  'system-entry-sync', 'sync-existing',
  'sync-group-join-prepare', 'sync-group-rejoin',
  'sync-group-rejoin-recover', 'sync-group-stopped-status'
])('requires the fixed A5 mutation lease for %s', (action) => {
  expect(assertRegisteredMacosA5Action(action)).toMatchObject({
    deviceLeaseMode: 'mutation',
    formalSourceClass: action === 'sync-group-stopped-status' ? 'ordinary-only' : 'frozen-build',
    mutatesFixedA5: true
  });
});
