// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { WINDOWS_DEV_DEFAULT_SSH, windowsDevScpSpec, windowsDevSshSpec,
  windowsDevTransportIdentity } from './windows-dev-remote-spec.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function identity(mode = 0o600, content = 'private-key-secret') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-ssh-owner-')); roots.push(home);
  const file = path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
  return { file, home };
}

it('uses explicit overrides before the dynamic home default', () => {
  const fallback = identity(); const explicit = identity();
  const defaultOwner = windowsDevTransportIdentity({ env: {}, home: fallback.home });
  expect(defaultOwner.host).toBe(WINDOWS_DEV_DEFAULT_SSH);
  expect(defaultOwner.identityPath).toBe(fs.realpathSync(fallback.file));
  const overridden = windowsDevTransportIdentity({ env: {
    FOLIOLE_WINDOWS_DEV_SSH: 'tester@host.example',
    FOLIOLE_WINDOWS_DEV_SSH_KEY: explicit.file }, home: fallback.home });
  expect(overridden.host).toBe('tester@host.example');
  expect(overridden.identityPath).toBe(fs.realpathSync(explicit.file));
});

it('rejects missing, relative, non-file, broad permissions, and invalid hosts', () => {
  const valid = identity();
  expect(() => windowsDevTransportIdentity({ env: { FOLIOLE_WINDOWS_DEV_SSH_KEY: 'relative' },
    home: valid.home })).toThrow('absolute');
  expect(() => windowsDevTransportIdentity({ env: { FOLIOLE_WINDOWS_DEV_SSH_KEY:
    path.join(valid.home, 'missing') }, home: valid.home })).toThrow();
  expect(() => windowsDevTransportIdentity({ env: { FOLIOLE_WINDOWS_DEV_SSH_KEY: valid.home },
    home: valid.home })).toThrow('ordinary file');
  const broad = identity(0o644);
  expect(() => windowsDevTransportIdentity({ env: {}, home: broad.home })).toThrow('too broad');
  const linked = identity(); const link = path.join(linked.home, 'identity-link');
  fs.symlinkSync(linked.file, link);
  expect(() => windowsDevTransportIdentity({ env: { FOLIOLE_WINDOWS_DEV_SSH_KEY: link },
    home: linked.home })).toThrow('ordinary file');
  expect(() => windowsDevTransportIdentity({ env: { FOLIOLE_WINDOWS_DEV_SSH: 'bad host' },
    home: valid.home })).toThrow('user@host');
});

it('emits a bounded receipt without private key bytes and feeds both specs', () => {
  const secret = 'never-emit-this-key'; const fixture = identity(0o600, secret);
  const owner = windowsDevTransportIdentity({ env: {}, home: fixture.home });
  expect(owner.receipt).toMatchObject({ host: WINDOWS_DEV_DEFAULT_SSH,
    identity: { mode: 0o600, path: fs.realpathSync(fixture.file), size: secret.length },
    schemaVersion: 1 });
  expect(owner.receipt.identity.sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(owner.receipt.optionsSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(JSON.stringify(owner.receipt)).not.toContain(secret);
  expect(windowsDevSshSpec(WINDOWS_DEV_DEFAULT_SSH, 'deploy', {}, fixture.home))
    .toContain(owner.identityPath);
  expect(windowsDevScpSpec(WINDOWS_DEV_DEFAULT_SSH, 'remote', 'local', {}, fixture.home))
    .toContain(owner.identityPath);
});
