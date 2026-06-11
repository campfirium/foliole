// @vitest-environment node
import { expect, it } from 'vitest';

import { applyWindowStateToOptions } from './windowStateLifecycle.js';

it('does not put fullscreen presentation into constructor options', () => {
  expect(
    applyWindowStateToOptions(
      { show: false },
      {
        height: 900,
        isFullScreen: true,
        isMaximized: false,
        width: 1400,
        x: 20,
        y: 30
      }
    )
  ).toEqual({
    height: 900,
    show: false,
    width: 1400,
    x: 20,
    y: 30
  });
});

it('drops restored coordinates that are outside every display work area', () => {
  expect(
    applyWindowStateToOptions(
      { show: false },
      {
        height: 640,
        isFullScreen: false,
        isMaximized: false,
        width: 960,
        x: -15992,
        y: -16000
      },
      [{ height: 1040, width: 1920, x: 0, y: 0 }]
    )
  ).toEqual({
    height: 640,
    show: false,
    width: 960
  });
});

it('keeps restored coordinates that intersect a display work area', () => {
  expect(
    applyWindowStateToOptions(
      { show: false },
      {
        height: 640,
        isFullScreen: false,
        isMaximized: false,
        width: 960,
        x: 120,
        y: 80
      },
      [{ height: 1040, width: 1920, x: 0, y: 0 }]
    )
  ).toEqual({
    height: 640,
    show: false,
    width: 960,
    x: 120,
    y: 80
  });
});

it('starts maximized windows at the matching display work area before presentation', () => {
  expect(
    applyWindowStateToOptions(
      { backgroundColor: '#ffffff', show: false },
      {
        height: 900,
        isFullScreen: false,
        isMaximized: true,
        width: 1400,
        x: 120,
        y: 80
      },
      [
        { height: 1040, width: 1920, x: 0, y: 0 },
        { height: 1440, width: 2560, x: 1920, y: 0 }
      ]
    )
  ).toEqual({
    backgroundColor: '#ffffff',
    height: 1040,
    show: false,
    width: 1920,
    x: 0,
    y: 0
  });
});
