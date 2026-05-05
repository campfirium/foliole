// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { applyWindowStateToOptions } from './windowStateLifecycle.js';

describe('window state startup options', () => {
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
});
