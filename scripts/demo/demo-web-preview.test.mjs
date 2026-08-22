// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createDemoPreviewLaunch, DEMO_PREVIEW_URL
} from './demo-web-preview.mjs';

describe('Demo Web preview', () => {
  it('runs the current workspace Demo on the Mac loopback interface', () => {
    const launch = createDemoPreviewLaunch({
      host: '127.0.0.1', nodePath: '/runtime/node', port: 43077, root: '/repo'
    });

    expect(DEMO_PREVIEW_URL).toBe('http://127.0.0.1:43077/en/demo/');
    expect(launch).toEqual({
      args: [
        'node_modules/vite/bin/vite.js', '--config', 'vite.demo.config.ts',
        '--host', '127.0.0.1', '--port', '43077', '--strictPort'
      ],
      command: '/runtime/node',
      options: { cwd: '/repo', shell: false, stdio: 'inherit' }
    });
    expect(launch.options).not.toHaveProperty('detached');
  });
});
