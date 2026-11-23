// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, respondToTurnProtocol, testMkdirSync } from './codexAppServerAdapter.testSupport.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';

it('adds custom instructions to the developer instructions of each turn that carries them', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    developerInstructions: 'Aide rules.\n',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand: vi.fn(() => process),
    timeoutMs: 1000
  });
  const instructions: string[] = [];
  process.stdin.on('data', (chunk) => {
    for (const line of chunk.toString().trim().split('\n').filter(Boolean)) {
      const message = JSON.parse(line);
      if (message.method === 'thread/start' || message.method === 'thread/resume') {
        instructions.push(message.params.developerInstructions);
      }
    }
    respondToTurnProtocol(process, chunk, []);
  });

  await adapter.sendMessage({ clientTurnId: 'client-1', customInstructions: 'Answer in French.', message: 'First' });
  await adapter.sendMessage({ clientTurnId: 'client-2', message: 'Second', providerThreadId: 'thr_1' });

  expect(instructions[0]).toMatch(/^Aide rules\.\n\nUser custom instructions .*\nAnswer in French\.\n$/su);
  expect(instructions[1]).toBe('Aide rules.\n');
});
