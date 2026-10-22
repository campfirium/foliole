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

it('steps down for a newer foreground desktop only while its own window is unfocused', async () => {
  const { updateDesktopFocus, isDesktopForeground, yieldDesktopForeground, changes, DESKTOP_FOREGROUND_DEBOUNCE_MS } = await load();
  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS);
  yieldDesktopForeground();
  expect(isDesktopForeground()).toBe(true);

  updateDesktopFocus({ focused: false, available: true });
  yieldDesktopForeground();
  expect(isDesktopForeground()).toBe(false);
  updateDesktopFocus({ focused: true, available: true });
  await vi.advanceTimersByTimeAsync(DESKTOP_FOREGROUND_DEBOUNCE_MS);
  expect(changes).toEqual([true, false, true]);
});
