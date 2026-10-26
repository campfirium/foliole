import fs from 'node:fs';
import path from 'node:path';

import { resolveElectronDevArtifactPaths } from '../../scripts/desktop/electron-dev-control-state.mjs';

import { expect, test } from './harness/fixtures';

test('desktop startup keeps readiness files inside its temporary runtime directory', async ({ desktopSession, desktopWindow }) => {
  const stateRoot = desktopSession.launchOptions.env.FOLIOLE_WORKDIR;
  if (typeof stateRoot !== 'string') throw new Error('isolated desktop workdir is required');
  const paths = resolveElectronDevArtifactPaths(stateRoot);
  await expect.poll(() => fs.existsSync(paths.windowVisibleFile)).toBe(true);
  const runtimePid = await desktopSession.electronApp.evaluate(() => process.pid);
  const markers = [paths.appReadyFile, paths.bridgeReadyFile, paths.windowVisibleFile]
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')));

  expect(markers.map((marker) => marker.stage)).toEqual(['app_ready', 'bridge_ready', 'window_visible']);
  expect(markers.every((marker) => marker.pid === runtimePid && marker.session === markers[0].session)).toBe(true);
  expect(fs.readdirSync(stateRoot).filter((name) => name.startsWith('.windows-'))).toEqual([]);
  expect(path.relative(stateRoot, paths.appReadyFile).split(path.sep)[0]).toBe('.tmp');
  await expect(desktopWindow.locator('#root')).toBeVisible();
});
