// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { testMkdirSync } from './codexAppServerAdapter.testSupport.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';

it('reports ready without starting app-server when the app-server command is available', async () => {
  const probeCommand = vi.fn(async () => true);
  const spawnCommand = vi.fn();
  const adapter = createStatusAdapter({ command: 'codex', probeCommand, spawnCommand });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    provider: 'codex-app-server',
    state: 'ready'
  });
  expect(probeCommand).toHaveBeenCalledWith('codex', expect.objectContaining({ cwd: TEST_LAUNCHER_CWD }));
  expect(spawnCommand).not.toHaveBeenCalled();
});

it('reports not_configured status when codex is unavailable', async () => {
  const adapter = createStatusAdapter({ command: 'codex', probeCommand: async () => false });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'not_configured' },
    state: 'unavailable'
  });
});

it('distinguishes an incompatible codex command from a missing command', async () => {
  const adapter = createStatusAdapter({
    findCommandCandidates: async () => ['codex'],
    probeCommand: async () => 'incompatible'
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'launch_failed' },
    state: 'unavailable'
  });
});

it('continues after an incompatible configured candidate when PATH has a working codex', async () => {
  const probeCommand = vi.fn(async (command: string) => command === 'codex' ? 'ready' : 'incompatible');
  const adapter = createStatusAdapter({
    findCommandCandidates: async () => ['/configured/codex', 'codex'],
    probeCommand
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({ state: 'ready' });
  expect(probeCommand.mock.calls.map(([command]) => command)).toEqual(['/configured/codex', 'codex']);
});

it('prefers a working Desktop runtime and falls back to the public codex command', async () => {
  const desktopCommand = 'C:\\Users\\Tester\\AppData\\Local\\OpenAI\\Codex\\bin\\abc123abc123abc1\\codex.exe';
  const probeCommand = vi.fn(async (command: string) => command === 'codex');
  const adapter = createStatusAdapter({
    findCommandCandidates: async () => [desktopCommand, 'codex'],
    probeCommand
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({ state: 'ready' });
  expect(probeCommand.mock.calls.map(([command]) => command)).toEqual([desktopCommand, 'codex']);
});

function createStatusAdapter(options: Partial<ConstructorParameters<typeof CodexAppServerAdapter>[0]>) {
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: testMkdirSync,
    readAccountState: async () => 'authenticated',
    ...options
  });
}
