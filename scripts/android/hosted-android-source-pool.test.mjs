// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/hosted-quality-portable-domain.yml', 'utf8'));
const job = workflow.jobs['portable-domain-tests'];

describe('hosted Android source pool contract', () => {
  it('uses process isolation for the Windows native test bucket only', () => {
    expect(job.env.VITEST_POOL)
      .toBe("${{ inputs.domain == 'android-source' && matrix.host == 'Windows' && 'forks' || 'threads' }}");
    expect(job.strategy.matrix.include).toEqual([
      { host: 'Ubuntu', runner: 'ubuntu-latest' },
      { host: 'Windows', runner: 'windows-latest' }
    ]);
  });
});
