import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  installLaunchAgent, launchAgentPaths, launchAgentXml, readManagedPlist
} from './scheduled-dev-push-launchd.mjs';

const temporaryDirectories = [];

function temporaryHome() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-push-launchd-'));
  temporaryDirectories.push(directory);
  return directory;
}

function dependencies() {
  return {
    bootstrap: vi.fn(), bootout: vi.fn(), lint: vi.fn(), serviceLoaded: vi.fn(() => false)
  };
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { force: true, recursive: true }));
});

it('schedules one midday run and three nightly attempts without a persistent process', () => {
  const xml = launchAgentXml({
    installedScript: '/runtime/push.mjs', nodePath: '/opt/homebrew/bin/node',
    repositoryRoot: '/repo', stderrPath: '/logs/err', stdoutPath: '/logs/out'
  });

  expect(xml).toContain('<integer>11</integer><key>Minute</key><integer>50</integer>');
  expect(xml).toContain('<integer>21</integer><key>Minute</key><integer>30</integer>');
  expect(xml).toContain('<integer>22</integer><key>Minute</key><integer>0</integer>');
  expect(xml.match(/<integer>22<\/integer>/gu)).toHaveLength(2);
  expect(xml).toContain(
    '<key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>'
  );
  expect(xml).not.toMatch(/RunAtLoad|KeepAlive/u);
});

it('installs a protected script copy and managed LaunchAgent plist', () => {
  const homeDirectory = temporaryHome();
  const sourceScript = path.join(homeDirectory, 'source.mjs');
  fs.writeFileSync(sourceScript, 'console.log("push")\n');
  const deps = dependencies();

  const result = installLaunchAgent({
    homeDirectory, nodePath: '/opt/homebrew/bin/node', platform: 'darwin',
    repositoryRoot: '/Users/roamer/P/Foliole', sourceScript
  }, deps);

  expect(fs.readFileSync(result.paths.installedScript, 'utf8')).toBe('console.log("push")\n');
  expect(readManagedPlist(result.paths.plistPath)).toContain('managed-by: foliole-scheduled-dev-push');
  expect(deps.lint).toHaveBeenCalledOnce();
  expect(deps.bootstrap).toHaveBeenCalledWith(result.paths.plistPath);
});

it('refuses to overwrite an unknown plist', () => {
  const paths = launchAgentPaths(temporaryHome());
  fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
  fs.writeFileSync(paths.plistPath, '<plist><string>unknown</string></plist>');

  expect(() => readManagedPlist(paths.plistPath)).toThrow('Refusing unknown LaunchAgent');
});
