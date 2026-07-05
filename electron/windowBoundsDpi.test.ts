// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const screenMock = vi.hoisted(() => ({
  getDisplayMatching: vi.fn(() => ({
    workArea: { height: 1040, width: 1920, x: 0, y: 0 }
  })),
  screenToDipRect: vi.fn((_window: unknown, rect: { height: number; width: number; x: number; y: number }) => ({
    height: rect.height / 2,
    width: rect.width / 2,
    x: rect.x / 2,
    y: rect.y / 2
  }))
}));

vi.mock('electron', () => ({
  screen: screenMock
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('normalizes physical Windows bounds back to DIP bounds', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  const { normalizeWindowBoundsToDip } = await import('./windowBoundsDpi.js');

  expect(
    normalizeWindowBoundsToDip(null, {
      height: 2106,
      width: 3866,
      x: -13,
      y: -13
    })
  ).toEqual({
    height: 1053,
    width: 1933,
    x: -6,
    y: -6
  });
});

it('keeps bounds that are already in DIP units', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  const { normalizeWindowBoundsToDip } = await import('./windowBoundsDpi.js');

  expect(
    normalizeWindowBoundsToDip(null, {
      height: 900,
      width: 1400,
      x: 80,
      y: 60
    })
  ).toEqual({
    height: 900,
    width: 1400,
    x: 80,
    y: 60
  });
});

it('falls back to rect-relative conversion when maximized window bounds are returned as physical pixels', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  screenMock.screenToDipRect.mockImplementation((window: unknown, rect) =>
    window
      ? rect
      : {
          height: rect.height / 2,
          width: rect.width / 2,
          x: rect.x / 2,
          y: rect.y / 2
        }
  );
  const { normalizeWindowBoundsToDip } = await import('./windowBoundsDpi.js');

  expect(
    normalizeWindowBoundsToDip({} as never, {
      height: 2106,
      width: 3866,
      x: -13,
      y: -13
    })
  ).toEqual({
    height: 1053,
    width: 1933,
    x: -6,
    y: -6
  });
});
