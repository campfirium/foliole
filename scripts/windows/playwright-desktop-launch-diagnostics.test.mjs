// @vitest-environment node

import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  APP_READY_FLAG,
  launchDesktopSession
} from './playwright-desktop-harness.mjs';

describe('playwright desktop launch diagnostics', () => {
  it('attaches desktop diagnostics when window acquisition stalls before domcontentloaded', async () => {
    const childProcess = {
      pid: 4821,
      stderr: new EventEmitter(),
      stdout: new EventEmitter()
    };
    const windowPage = new EventEmitter();
    windowPage.url = () => 'http://127.0.0.1:24600/';
    windowPage.evaluate = async (pageFunction, appReadyFlag) => {
      if (appReadyFlag === APP_READY_FLAG) {
        return pageFunction(appReadyFlag);
      }
      throw new Error('Execution context was destroyed.');
    };
    windowPage.waitForLoadState = async () => {
      throw new Error('page.waitForLoadState: Timeout 30000ms exceeded');
    };

    const electronLauncher = {
      async launch() {
        return {
          async close() {},
          process() {
            return childProcess;
          },
          async firstWindow() {
            childProcess.stdout.emit('data', Buffer.from('did-start-navigation http://127.0.0.1:24600/\n'));
            windowPage.emit('framenavigated', {
              parentFrame: () => null,
              url: () => 'http://127.0.0.1:24600/'
            });
            return windowPage;
          },
          windows() {
            return [windowPage];
          }
        };
      }
    };

    await expect(
      launchDesktopSession({
        appRoot: '/workspace/foliole',
        electronLauncher,
        env: {
          FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
          FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS: '500',
          FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state'
        },
        existsSync: () => true
      })
    ).rejects.toMatchObject({
      desktopDiagnostics: {
        boot: { bootEvents: [] },
        currentRuntime: { appReady: false, pid: 4821, rendererUrl: null },
        mainProcessLogs: { stdoutTail: ['did-start-navigation http://127.0.0.1:24600/\n'] },
        rendererPage: {
          error: 'Execution context was destroyed.',
          pageUrl: 'http://127.0.0.1:24600/',
          url: 'http://127.0.0.1:24600/'
        },
        rendererPageEvents: [],
        rendererRuntime: { appReady: false, readyState: null, rendererUrl: null }
      }
    });
  });
});
