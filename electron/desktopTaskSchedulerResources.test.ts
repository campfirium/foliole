// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { reportDesktopTaskResponsiveness, resetDesktopTaskPressureForTests } from './desktopTaskPressure.js';
import { DesktopTaskScheduler } from './desktopTaskScheduler.js';
import type { DesktopTaskDefinition } from './desktopTaskTypes.js';

beforeEach(() => resetDesktopTaskPressureForTests());

function createScheduler(now = Date.now) {
  const events: Array<{ payload: unknown; stage: string }> = [];
  const scheduler = new DesktopTaskScheduler({
    appendEvent: vi.fn(async (stage: string, payload: unknown) => { events.push({ payload, stage }); }),
    now
  });
  return { events, scheduler };
}

function createTask(id: string, run: DesktopTaskDefinition['run'], priority: DesktopTaskDefinition['priority']) {
  return { concurrencyKey: id, id, label: id, priority, run, source: 'test' } satisfies DesktopTaskDefinition;
}

async function waitForScheduler() {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

it('runs light work while serializing heavy CPU work', async () => {
  const { scheduler } = createScheduler();
  const order: string[] = [];
  let releaseHeavy = () => {};
  const heavyGate = new Promise<void>((resolve) => { releaseHeavy = resolve; });
  const heavyResources = [{ resource: 'total' as const }, { resource: 'cpu-heavy' as const }];
  const first = scheduler.submit({
    ...createTask('heavy-first', async () => {
      order.push('heavy-first:start');
      await heavyGate;
      order.push('heavy-first:end');
    }, 'background'),
    resources: heavyResources
  });
  scheduler.submit({ ...createTask('heavy-second', () => order.push('heavy-second'), 'background'), resources: heavyResources });
  scheduler.submit({ ...createTask('light', () => order.push('light'), 'background'), resources: [{ resource: 'total' }] });
  await waitForScheduler();
  expect(order).toEqual(['heavy-first:start', 'light']);
  releaseHeavy();
  await first.promise;
  await waitForScheduler();
  expect(order).toEqual(['heavy-first:start', 'light', 'heavy-first:end', 'heavy-second']);
});

it('promotes old background work without resetting its original wait', async () => {
  let now = 0;
  const { events, scheduler } = createScheduler(() => now);
  const order: string[] = [];
  let releaseBlocker = () => {};
  const blockerGate = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  const resources = [{ resource: 'total' as const }, { resource: 'cpu-heavy' as const }];
  scheduler.submit({ ...createTask('blocker', () => blockerGate, 'foreground'), resources });
  scheduler.submit({ ...createTask('old', () => order.push('old'), 'background'), maxWaitMs: 100, resources });
  await waitForScheduler();
  now = 250;
  scheduler.submit({ ...createTask('new', () => order.push('new'), 'startup'), resources });
  releaseBlocker();
  await waitForScheduler();
  expect(order).toEqual(['old', 'new']);
  expect(events.filter((event) => event.stage === 'desktop_task_completed')).toHaveLength(3);
});

it('keeps light work moving while pressure pauses new heavy maintenance', async () => {
  const { scheduler } = createScheduler();
  const order: string[] = [];
  reportDesktopTaskResponsiveness(75);
  scheduler.submit({
    ...createTask('heavy', () => order.push('heavy'), 'background'),
    resources: [{ resource: 'total' }, { resource: 'cpu-heavy' }]
  });
  scheduler.submit({ ...createTask('light', () => order.push('light'), 'background'), resources: [{ resource: 'total' }] });
  await waitForScheduler();
  expect(order).toEqual(['light']);
  reportDesktopTaskResponsiveness(0);
  reportDesktopTaskResponsiveness(0);
  reportDesktopTaskResponsiveness(0);
  scheduler.notifyPressureChanged();
  await waitForScheduler();
  expect(order).toEqual(['light', 'heavy']);
});

it('releases library tasks before a library switch and resumes later submissions', async () => {
  const { scheduler } = createScheduler();
  const order: string[] = [];
  const first = scheduler.submit({
    ...createTask('library-active', async (context) => {
      order.push('active');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await context.yieldIfNeeded();
    }, 'background'),
    cancellable: true,
    resources: [{ resource: 'total' }, { resource: 'library' }]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const resume = await scheduler.pauseResource('library');
  await expect(first.promise).resolves.toBeUndefined();
  scheduler.submit({ ...createTask('library-next', () => order.push('next'), 'background'), resources: [{ resource: 'total' }, { resource: 'library' }] });
  await waitForScheduler();
  expect(order).toEqual(['active']);
  resume();
  await waitForScheduler();
  expect(order).toEqual(['active', 'next']);
});
