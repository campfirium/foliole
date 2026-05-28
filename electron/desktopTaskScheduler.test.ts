// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { DesktopTaskScheduler } from './desktopTaskScheduler.js';
import type { DesktopTaskDefinition } from './desktopTaskTypes.js';

function createScheduler() {
  const events: Array<{ payload: unknown; stage: string }> = [];
  const scheduler = new DesktopTaskScheduler({
    appendEvent: vi.fn(async (stage: string, payload: unknown) => {
      events.push({ payload, stage });
    })
  });
  return { events, scheduler };
}

function createTask(id: string, run: DesktopTaskDefinition['run'], priority: DesktopTaskDefinition['priority']) {
  return {
    concurrencyKey: id,
    id,
    label: id,
    priority,
    run,
    source: 'test'
  } satisfies DesktopTaskDefinition;
}

async function waitForScheduler() {
  for (let index = 0; index < 6; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

it('runs foreground work before startup and background work', async () => {
  const { scheduler } = createScheduler();
  const order: string[] = [];

  scheduler.submit(createTask('background', () => order.push('background'), 'background'));
  scheduler.submit(createTask('foreground', () => order.push('foreground'), 'foreground'));
  scheduler.submit(createTask('startup', () => order.push('startup'), 'startup'));
  await waitForScheduler();

  expect(order).toEqual(['foreground', 'startup', 'background']);
});

it('coalesces duplicate concurrency keys and preserves same-priority FIFO order', async () => {
  const { scheduler } = createScheduler();
  const order: string[] = [];

  const first = scheduler.submit(createTask('same', () => order.push('first'), 'startup'));
  const duplicate = scheduler.submit({
    ...createTask('same-copy', () => order.push('duplicate'), 'startup'),
    concurrencyKey: 'same'
  });
  scheduler.submit(createTask('next', () => order.push('next'), 'startup'));
  await waitForScheduler();

  expect(duplicate.promise).toBe(first.promise);
  expect(order).toEqual(['first', 'next']);
});

it('passes cancellation and reports cancelled tasks without blocking later tasks', async () => {
  const { events, scheduler } = createScheduler();
  const order: string[] = [];

  const handle = scheduler.submit({
    ...createTask(
      'cancelled',
      async (context) => {
        await context.yieldIfNeeded();
        order.push('cancelled');
      },
      'startup'
    ),
    cancellable: true
  });
  handle.cancel();
  scheduler.submit(createTask('after', () => order.push('after'), 'startup'));
  await waitForScheduler();

  expect(order).toEqual(['after']);
  expect(events.map((event) => event.stage)).toContain('desktop_task_cancelled');
});

it('retries transient failures and classifies permanent failures', async () => {
  const { events, scheduler } = createScheduler();
  let attempts = 0;

  const recovered = scheduler.submit({
    ...createTask(
      'retry',
      () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('transient');
        }
      },
      'startup'
    ),
    retry: { attempts: 2 }
  });
  const failed = scheduler.submit(createTask('failed', () => {
    throw new Error('permanent');
  }, 'startup'));
  await expect(recovered.promise).resolves.toBeUndefined();
  await expect(failed.promise).rejects.toThrow('permanent');

  expect(events.map((event) => event.stage)).toContain('desktop_task_retrying');
  expect(events.map((event) => event.stage)).toContain('desktop_task_failed');
});

it('throttles high-frequency progress events', async () => {
  const { events, scheduler } = createScheduler();

  scheduler.submit(createTask(
    'progress',
    (context) => {
      for (let completed = 1; completed <= 60; completed += 1) {
        context.progress({ completed, total: 60, unit: 'row' });
      }
    },
    'background'
  ));
  await waitForScheduler();

  const progressEvents = events.filter((event) => event.stage === 'desktop_task_progress');
  expect(progressEvents).toHaveLength(4);
  expect(progressEvents.map((event) => (event.payload as { completed: number }).completed)).toEqual([1, 26, 51, 60]);
});
