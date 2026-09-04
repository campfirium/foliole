import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

import { isDesktopWorkspaceUrl, parseJourneyConfig } from './cross-client-sync-journey.mjs';
import { parseLaunchConfig } from './launch-isolated-desktop.mjs';

const roots = [];

function temporaryRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-cross-client-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { force: true, recursive: true });
});

it('accepts only isolated launcher paths and a full revision', () => {
  const repoRoot = temporaryRepo();
  const artifactRoot = path.join(repoRoot, '.tmp', 'artifacts', 'run-1');
  const stateRoot = path.join(artifactRoot, 'mac-runtime');
  const result = path.join(stateRoot, 'launch-result.json');
  const config = parseLaunchConfig([
    '--artifact-root', artifactRoot,
    '--state-root', stateRoot,
    '--result', result,
    '--revision', 'a'.repeat(40),
    '--cdp-port', '19224'
  ], repoRoot);
  expect(config).toMatchObject({ cdpPort: 19224, resultPath: result, revision: 'a'.repeat(40), stateRoot });
  expect(() => parseLaunchConfig([
    '--artifact-root', artifactRoot,
    '--state-root', path.join(repoRoot, 'outside'),
    '--result', result,
    '--revision', 'a'.repeat(40),
    '--cdp-port', '19224'
  ], repoRoot)).toThrow('state root must be inside artifact root');
});

it('requires loopback journey endpoints and a full revision', () => {
  const repoRoot = temporaryRepo();
  const artifactRoot = path.join(repoRoot, '.tmp', 'artifacts', 'run-2');
  const argv = [
    '--artifact-root', artifactRoot,
    '--instance', 'a',
    '--mac-cdp', 'http://127.0.0.1:19224',
    '--windows-cdp', 'http://127.0.0.1:19222',
    '--revision', 'b'.repeat(40)
  ];
  expect(parseJourneyConfig(argv)).toMatchObject({ artifactRoot, instance: 'a', revision: 'b'.repeat(40) });
  expect(() => parseJourneyConfig(argv.map((value) =>
    value === 'http://127.0.0.1:19222' ? 'http://192.168.0.11:9222' : value
  ))).toThrow('CDP endpoints must use loopback HTTP');

  expect(() => parseJourneyConfig(argv.map((value) =>
    value === 'b'.repeat(40) ? 'short-revision' : value
  ))).toThrow('revision must be a full commit hash');
});

it('recognizes packaged Electron workspaces on both desktop hosts', () => {
  expect(isDesktopWorkspaceUrl('file:///Users/roamer/P/Foliole-sync/dist/desktop/index.html')).toBe(true);
  expect(isDesktopWorkspaceUrl('file:///D:/C/foliole-sync/dist/desktop/index.html')).toBe(true);
  expect(isDesktopWorkspaceUrl('http://127.0.0.1:4173/')).toBe(true);
  expect(isDesktopWorkspaceUrl('https://example.com/')).toBe(false);
});

it('keeps one Mac journey separate from source and client lifecycle control', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const journey = fs.readFileSync(path.join(root, 'cross-client-sync-journey.mjs'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'launch-isolated-desktop.mjs'), 'utf8');
  expect(journey).toContain('chromium.connectOverCDP');
  expect(journey).toContain('browser.close()');
  expect(journey).not.toMatch(/child_process|\bssh\b|\bgit\b|receipt/iu);
  expect(launcher).toContain("FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1'");
  expect(launcher).not.toMatch(/create_sync_group|request_sync_group_join|create_topic/iu);
});
