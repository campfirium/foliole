import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

async function load() {
  vi.useFakeTimers();
  const presence = await import('./desktopForegroundPresence.js');
  const changes: boolean[] = [];
  presence.subscribeDesktopForeground(next => changes.push(next));
  return { ...presence, changes };
}

it('becomes foreground only after focus stays for the debounce', async () => {
  const { updateDesktopFocus, isDesktopForeground, changes, DESKTOP_FOREGROUND_DEBOUNCE_MS } = await load();
  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS - 1);
  updateDesktopFocus({ focused: false, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS);
  expect(isDesktopForeground()).toBe(false);

  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS);
  expect(isDesktopForeground()).toBe(true);
  expect(changes).toEqual([true]);
});

it('keeps foreground after the window loses focus until the screen locks or the system sleeps', async () => {
  const { updateDesktopFocus, isDesktopForeground, changes, DESKTOP_FOREGROUND_DEBOUNCE_MS } = await load();
  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS);
  updateDesktopFocus({ focused: false, available: true });
  expect(isDesktopForeground()).toBe(true);

  updateDesktopFocus({ focused: false, available: false });
  expect(isDesktopForeground()).toBe(false);
  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS - 1);
  expect(isDesktopForeground()).toBe(false);
  expect(changes).toEqual([true, false]);
});

it('keeps the lead while someone uses this machine in another app and steps down once it is idle', async () => {
  const presence = await load();
  let idle = 0;
  presence.setDesktopIdleSecondsSource(() => idle);
  presence.updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(presence.DESKTOP_FOREGROUND_DEBOUNCE_MS);
  presence.updateDesktopFocus({ focused: false, available: true });
  presence.yieldDesktopForeground();
  expect(presence.isDesktopForeground()).toBe(true);
  idle = presence.DESKTOP_FOREGROUND_DEBOUNCE_MS / 1000;
  presence.yieldDesktopForeground();
  expect(presence.isDesktopForeground()).toBe(false);
  expect(presence.changes).toEqual([true, false]);
});

it('does not take the lead when its window regains focus on a machine nobody is using', async () => {
  const presence = await load();
  let idle = 600;
  presence.setDesktopIdleSecondsSource(() => idle);
  presence.updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(presence.DESKTOP_FOREGROUND_DEBOUNCE_MS);
  expect(presence.isDesktopForeground()).toBe(false);
  idle = 0;
  presence.updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(presence.DESKTOP_FOREGROUND_DEBOUNCE_MS);
  expect(presence.isDesktopForeground()).toBe(true);
});

it('steps down while its window stays focused once nobody has touched this machine for the debounce', async () => {
  const presence = await load();
  let idle = 0;
  presence.setDesktopIdleSecondsSource(() => idle);
  presence.updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(presence.DESKTOP_FOREGROUND_DEBOUNCE_MS);
  idle = presence.DESKTOP_FOREGROUND_DEBOUNCE_MS / 1000 - 1;
  presence.yieldDesktopForeground();
  expect(presence.isDesktopForeground()).toBe(true);
  idle = presence.DESKTOP_FOREGROUND_DEBOUNCE_MS / 1000;
  presence.yieldDesktopForeground();
  expect(presence.isDesktopForeground()).toBe(false);
});
