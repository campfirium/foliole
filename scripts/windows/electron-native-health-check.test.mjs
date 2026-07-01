// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { canRunGuiHealth, resolveElectronExecutablePath } from './electron-native-health-check.mjs';
import { markerMatches, readyMarkersMatch } from './electron-native-health-check-support.mjs';
import { createRendererReloadIntent } from './write-renderer-reload-intent.mjs';

it('matches ready markers by stage, session, and runtime pid', () => {
  const marker = {
    pid: 123,
    session: 'session-1',
    stage: 'app_ready'
  };

  expect(markerMatches(marker, 'app_ready', 'session-1', 123)).toBe(true);
  expect(markerMatches(marker, 'bridge_ready', 'session-1', 123)).toBe(false);
  expect(markerMatches(marker, 'app_ready', 'session-2', 123)).toBe(false);
  expect(markerMatches(marker, 'app_ready', 'session-1', 456)).toBe(false);
});

it('accepts app and bridge markers with the same session and runtime pid', () => {
  const appReady = { pid: 123, session: 'session-1', stage: 'app_ready' };
  const bridgeReady = { pid: 123, session: 'session-1', stage: 'bridge_ready' };

  expect(readyMarkersMatch(appReady, bridgeReady, 'session-1')).toBe(true);
  expect(readyMarkersMatch({ ...appReady, pid: 456 }, bridgeReady, 'session-1')).toBe(false);
  expect(readyMarkersMatch(appReady, { ...bridgeReady, session: 'session-2' }, 'session-1')).toBe(false);
});

it('uses the existing renderer reload intent contract', () => {
  expect(createRendererReloadIntent({
    head: '',
    nonce: 1,
    reason: 'windows-native-health-check',
    requestedAt: '2026-05-21T00:00:00.000Z',
    requestedBy: 'windows-native-health-check'
  })).toMatchObject({
    kind: 'foliole.electron.dev.renderer-reload-intent.v1',
    nonce: 1,
    target: 'electron-dev-renderer'
  });
});

it('resolves the Electron executable for the current host platform', () => {
  expect(resolveElectronExecutablePath('/repo', 'win32')).toBe(
    path.join('/repo', 'node_modules', 'electron', 'dist', 'electron.exe')
  );
  expect(resolveElectronExecutablePath('/repo', 'linux')).toBe(
    path.join('/repo', 'node_modules', 'electron', 'dist', 'electron')
  );
});

it('keeps GUI health gated to Windows or display-capable hosts', () => {
  expect(canRunGuiHealth({}, 'linux')).toBe(false);
  expect(canRunGuiHealth({ DISPLAY: ':0' }, 'linux')).toBe(true);
  expect(canRunGuiHealth({}, 'win32')).toBe(true);
});
