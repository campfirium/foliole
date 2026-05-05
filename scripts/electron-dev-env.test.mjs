import { describe, expect, it } from 'vitest';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';

describe('createElectronLaunchEnv', () => {
  it('removes ELECTRON_RUN_AS_NODE and keeps renderer url', () => {
    const env = createElectronLaunchEnv(
      {
        PATH: '/tmp/bin',
        ELECTRON_RUN_AS_NODE: '1'
      },
      'http://127.0.0.1:4600'
    );

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.ELECTRON_RENDERER_URL).toBe('http://127.0.0.1:4600');
    expect(env.PATH).toBe('/tmp/bin');
  });
});
