// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { runFriDevWorkflow } from './fri-dev-workflow.mjs';

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal(), spawnSync: vi.fn(), spawn: vi.fn()
}));

it('stops development workflow with current diagnosis without starting a recovery process', async () => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/t337-dev-failure-'));
  const stdout = [
    JSON.stringify({ event: 'fri-run-started', invocationId: 'current' }),
    JSON.stringify({ event: 'fri-run-completed', invocationId: 'current',
      diagnosis: { methodsStarted: [], failures: [{ kind: 'automation-startup' }] } })
  ].join('\n');
  const mocked = vi.mocked(spawnSync);
  mocked.mockReturnValue({ status: 0 });
  const spawned = vi.mocked(spawn);
  const children = [];
  spawned.mockImplementation(() => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    children.push(child);
    return child;
  });
  const written = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    const running = runFriDevWorkflow({ evidenceRoot: root,
      readiness: async () => {}, retention: async () => {} });
    await vi.waitFor(() => expect(children).toHaveLength(1));
    children[0].emit('close', 0, null);
    await vi.waitFor(() => expect(children).toHaveLength(2));
    children[1].stdout.write(stdout);
    expect(written).toHaveBeenCalledWith(stdout);
    children[1].emit('close', 65, null);
    await expect(running).rejects
      .toMatchObject({ code: 65, invocationId: 'current', message: expect.stringContaining('automation-startup') });
    expect(mocked.mock.calls.map(([command]) => command)).toEqual(['npm', 'npx']);
    expect(spawned.mock.calls.map(([command]) => command)).toEqual(['bash', 'bash']);
  } finally {
    mocked.mockReset();
    spawned.mockReset();
    written.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
