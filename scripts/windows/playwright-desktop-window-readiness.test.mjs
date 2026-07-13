// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  APP_READY_FLAG,
  acquireStableDesktopWindow,
  waitForDesktopAppReady
} from '../desktop/playwright-desktop-harness.mjs';

describe('playwright desktop window readiness', () => {
  it('waits for a non-blank desktop window before returning it', async () => {
    const calls = [];
    const windowPage = {
      async waitForFunction(pageFunction, arg, options) {
        calls.push(['waitForFunction', pageFunction, arg, options]);
      },
      async waitForLoadState(state, options) {
        calls.push(['waitForLoadState', state, options]);
      },
      async evaluate(pageFunction) {
        calls.push(['evaluate', pageFunction]);
        return true;
      }
    };

    const stableWindow = await acquireStableDesktopWindow(
      {
        async firstWindow({ timeout }) {
          calls.push(['firstWindow', timeout]);
          return windowPage;
        },
        windows() {
          calls.push(['windows']);
          return [windowPage];
        }
      },
      4_321
    );

    expect(stableWindow).toBe(windowPage);
    expect(calls).toEqual([
      ['firstWindow', 4_321],
      ['windows'],
      ['waitForLoadState', 'domcontentloaded', { timeout: 500 }],
      ['evaluate', expect.any(Function)]
    ]);
  });

  it('waits for the renderer app_ready flag before returning metadata', async () => {
    const calls = [];
    const appReady = await waitForDesktopAppReady(
      {
        async evaluate(pageFunction, appReadyFlag) {
          calls.push(['evaluate', pageFunction, appReadyFlag]);
          return {
            href: 'file:///workspace/foliole/dist/desktop/index.html',
            readyState: 'complete',
            reported: true
          };
        },
        async waitForFunction(pageFunction, appReadyFlag, options) {
          calls.push(['waitForFunction', pageFunction, appReadyFlag, options]);
        }
      },
      7_654
    );

    expect(appReady).toEqual({
      href: 'file:///workspace/foliole/dist/desktop/index.html',
      readyState: 'complete',
      reported: true
    });
    expect(calls).toEqual([
      ['waitForFunction', expect.any(Function), APP_READY_FLAG, { timeout: 7_654 }],
      ['evaluate', expect.any(Function), APP_READY_FLAG]
    ]);
  });
});
