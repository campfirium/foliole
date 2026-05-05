import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE_ROOT_ENV = 'FOLIOLE_ELECTRON_TEST_STATE_ROOT';

export function createDesktopIsolationContext(env = process.env) {
  const configuredStateRoot = env[STATE_ROOT_ENV]?.trim();
  const runtimeStateRoot = configuredStateRoot
    ? path.resolve(configuredStateRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-playwright-'));

  const userDataPath = path.join(runtimeStateRoot, 'user-data');
  const sessionDataPath = path.join(runtimeStateRoot, 'session-data');

  return {
    cleanup() {
      if (!configuredStateRoot) {
        fs.rmSync(runtimeStateRoot, { force: true, recursive: true });
      }
    },
    env: {
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_SESSION_DATA_PATH: sessionDataPath,
      FOLIOLE_USER_DATA_PATH: userDataPath,
      FOLIOLE_WORKDIR: runtimeStateRoot
    },
    runtimeStateRoot,
    sessionDataPath,
    userDataPath
  };
}
