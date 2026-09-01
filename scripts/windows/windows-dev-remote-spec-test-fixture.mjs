import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createWindowsDevRemoteSpecTestFixture(mode = 0o600,
  content = 'test identity') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-transport-owner-'));
  const identityPath = path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, content);
  const canonicalIdentity = fs.realpathSync(identityPath);
  const fsApi = { ...fs, lstatSync(target) {
    const facts = fs.lstatSync(target);
    if (![path.resolve(identityPath), canonicalIdentity].includes(path.resolve(target))) return facts;
    return Object.assign(Object.create(facts), { mode: (facts.mode & ~0o777) | mode });
  } };
  return {
    cleanup: () => fs.rmSync(home, { force: true, recursive: true }),
    env: { FOLIOLE_WINDOWS_DEV_SSH_KEY: identityPath }, fsApi, home, identityPath
  };
}
