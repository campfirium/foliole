// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/hosted-quality-portable.yml', 'utf8'));
const job = workflow.jobs['portable-tests'];

describe('hosted Android source pool contract', () => {
  it('uses process isolation for the Windows native test bucket only', () => {
    const rows = job.strategy.matrix.include;
    const windowsAndroid = rows.find(({ domain, host }) => domain === 'android-source' && host === 'Windows');

    expect(windowsAndroid.vitest_pool).toBe('forks');
    expect(rows.filter((row) => row !== windowsAndroid).map(({ vitest_pool }) => vitest_pool)).toEqual([
      'threads', 'threads', 'threads'
    ]);
    expect(job.env.VITEST_POOL).toBe('${{ matrix.vitest_pool }}');
  });
});
