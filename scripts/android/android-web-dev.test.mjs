// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createWebDevLaunch, parseWebDevArgs } from './android-web-dev.mjs';

describe('android Web dev entry', () => {
  it('runs the companion Vite server in the foreground without service state', () => {
    const launch = createWebDevLaunch({
      host: '127.0.0.1',
      nodePath: '/runtime/node',
      port: 24604,
      root: '/repo'
    });

    expect(launch).toMatchObject({
      command: '/runtime/node',
      args: [
        'node_modules/vite/bin/vite.js',
        '--config',
        'vite.companion.config.ts',
        '--host',
        '127.0.0.1'
      ],
      options: {
        cwd: '/repo',
        env: {
          FOLIOLE_COMPANION_PREVIEW_DB: '/repo/.cache/companion-preview/device/foliole-companionSQLite.db',
          FOLIOLE_VITE_HMR: '1',
          FOLIOLE_VITE_PORT: '24604'
        },
        shell: false,
        stdio: 'inherit'
      }
    });
    expect(launch.options).not.toHaveProperty('detached');
  });

  it('keeps each preview data source in its own rebuildable library', () => {
    const empty = createWebDevLaunch({ data: 'empty', root: '/repo' });

    expect(empty.options.env.FOLIOLE_COMPANION_PREVIEW_DB)
      .toBe('/repo/.cache/companion-preview/empty/foliole-companionSQLite.db');
    expect(parseWebDevArgs([])).toEqual({ data: 'device' });
    expect(parseWebDevArgs(['--data', 'empty'])).toEqual({ data: 'empty' });
    expect(() => parseWebDevArgs(['--data', 'sample'])).toThrow('--data must be one of');
  });
  it('uses a dedicated database and port for the sandbox and scopes reset to that mode', () => {
    const options = parseWebDevArgs(['--data', 'sandbox', '--reset']);
    const launch = createWebDevLaunch({ ...options, root: '/repo' });

    expect(launch.options.env).toMatchObject({
      FOLIOLE_COMPANION_PREVIEW_DB: '/repo/.cache/companion-preview/sandbox/foliole-companionSQLite.db',
      FOLIOLE_COMPANION_SANDBOX: '1',
      FOLIOLE_COMPANION_SANDBOX_RESET: '1',
      FOLIOLE_VITE_PORT: '24606'
    });
    expect(createWebDevLaunch({ data: 'sandbox' }).options.env.FOLIOLE_COMPANION_SANDBOX_RESET).toBe('');
    expect(() => parseWebDevArgs(['--reset'])).toThrow('only applies to --data sandbox');
  });
});
