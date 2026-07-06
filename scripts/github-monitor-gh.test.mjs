import { describe, expect, it } from 'vitest';

import { formatGhFailure } from './github-monitor-gh.mjs';

describe('github monitor gh helper', () => {
  it('includes timeout and process details in failure messages', () => {
    const message = formatGhFailure('gh', ['run', 'list'], {
      error: new Error('spawnSync gh ETIMEDOUT'),
      signal: 'SIGTERM',
      status: null,
      stderr: '',
      stdout: ''
    }, 120000);

    expect(message).toContain('gh run list failed');
    expect(message).toContain('signal=SIGTERM');
    expect(message).toContain('error=spawnSync gh ETIMEDOUT');
    expect(message).toContain('timeoutMs=120000');
  });
});
