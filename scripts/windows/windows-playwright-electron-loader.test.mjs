// @vitest-environment node
/* global process */

import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

it('sets the Electron debugging switch before controlling the ready lifecycle', async () => {
  const order = [];
  const originalEmit = vi.fn();
  const app = { commandLine: { appendSwitch: vi.fn(() => order.push('switch')) },
    emit: originalEmit, listenerCount: vi.fn(() => 1),
    whenReady: vi.fn(() => { order.push('when-ready'); return Promise.resolve('ready'); }) };
  const context = { process: { argv: [...process.argv,
    '--remote-debugging-port=0'] }, Promise, require: vi.fn(() => ({ app })) };
  vm.runInNewContext(fs.readFileSync(
    'scripts/windows/windows-playwright-electron-loader.cjs', 'utf8'
  ), context);
  expect(order).toEqual(['switch', 'when-ready']);
  expect(context.process.argv).not.toContain('--remote-debugging-port=0');
  expect(app.isReady()).toBe(false);
  app.emit('ready');
  await context.__playwright_run();
  expect(app.isReady()).toBe(true);
  expect(originalEmit).toHaveBeenCalledWith('ready');
});
