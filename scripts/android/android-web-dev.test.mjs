// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createWebDevLaunch } from './android-web-dev.mjs';

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
        env: { FOLIOLE_VITE_PORT: '24604' },
        shell: false,
        stdio: 'inherit'
      }
    });
    expect(launch.options).not.toHaveProperty('detached');
  });
});
