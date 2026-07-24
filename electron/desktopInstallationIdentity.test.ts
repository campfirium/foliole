// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { loadOrCreateDesktopInstallationIdentity } from './desktopInstallationIdentity.js';

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-installation-identity-'));
  roots.push(root);
  return root;
}

it('keeps one installation id outside copied library databases', () => {
  const root = makeRoot();
  const first = loadOrCreateDesktopInstallationIdentity(root);
  const second = loadOrCreateDesktopInstallationIdentity(root);
  expect(second.installationId).toBe(first.installationId);
  expect(second.deviceName).toBe(os.hostname());
});

it('quarantines a corrupt identity and creates a replacement', () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, 'desktop-installation.json'), '{broken');
  const identity = loadOrCreateDesktopInstallationIdentity(root);
  expect(identity.installationId).toMatch(/^desktop-installation-/);
  expect(fs.readdirSync(root).some((name) => name.startsWith('desktop-installation.json.corrupt-'))).toBe(true);
});
