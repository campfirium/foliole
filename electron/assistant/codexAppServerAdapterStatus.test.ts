// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { testMkdirSync } from './codexAppServerAdapter.testSupport.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';

it('reports ready without starting app-server when the codex command and login are available', async () => {
  const probeCommand = vi.fn(async () => true);
  const authProbeCommand = vi.fn(async () => true);
  const spawnCommand = vi.fn();
  const adapter = createStatusAdapter({ authProbeCommand, probeCommand, spawnCommand });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    provider: 'codex-app-server',
    state: 'ready'
  });
  expect(probeCommand).toHaveBeenCalledWith('codex', expect.objectContaining({ cwd: TEST_LAUNCHER_CWD }));
  expect(authProbeCommand).toHaveBeenCalledWith('codex', expect.objectContaining({ cwd: TEST_LAUNCHER_CWD }));
  expect(spawnCommand).not.toHaveBeenCalled();
});

it('reports auth_failed status when Codex is installed but not logged in', async () => {
  const spawnCommand = vi.fn();
  const adapter = createStatusAdapter({
    authProbeCommand: async () => false,
    probeCommand: async () => true,
    spawnCommand
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });
  expect(spawnCommand).not.toHaveBeenCalled();
});

it('reports not_configured status when codex is unavailable', async () => {
  const adapter = createStatusAdapter({ probeCommand: async () => false });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'not_configured' },
    state: 'unavailable'
  });
});

function createStatusAdapter(options: Partial<ConstructorParameters<typeof CodexAppServerAdapter>[0]>) {
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: testMkdirSync,
    ...options
  });
}
