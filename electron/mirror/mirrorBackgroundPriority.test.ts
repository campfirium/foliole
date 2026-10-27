// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { DESKTOP_OPERATION_DEFINITIONS } from '../desktopOperationDefinitions.js';
import { DesktopTaskScheduler } from '../desktopTaskScheduler.js';

it.each(['mirror-incremental', 'mirror-backfill'] as const)('keeps aged %s behind foreground work', async (name) => {
  let now = 0;
  const scheduler = new DesktopTaskScheduler({ now: () => now, appendEvent: vi.fn(async () => {}) });
  const definition = DESKTOP_OPERATION_DEFINITIONS[name];
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const resources = [{ resource: 'cpu-heavy' as const }];
  const blocker = scheduler.submit({ id: 'blocker', concurrencyKey: 'blocker', label: 'blocker', source: 'test',
    priority: 'foreground', resources, run: () => gate });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const mirror = scheduler.submit({ ...definition, id: name, run: () => { order.push('mirror'); } });
  now = 1_000_000;
  const foreground = scheduler.submit({ id: 'foreground', concurrencyKey: 'foreground', label: 'foreground', source: 'test',
    priority: 'foreground', resources, run: () => { order.push('foreground'); } });
  release();
  await Promise.all([blocker.promise, mirror.promise, foreground.promise]);
  expect(order).toEqual(['foreground', 'mirror']);
  expect(definition.priority).toBe('background');
});
