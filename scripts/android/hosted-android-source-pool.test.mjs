// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { portableDomainHosts } from '../quality/portable-domain-hosts.test-support.mjs';

const workflow = parse(fs.readFileSync('.github/workflows/hosted-quality-portable-domain.yml', 'utf8'));
const job = workflow.jobs['portable-domain-tests'];
const UBUNTU = { host: 'Ubuntu', runner: 'ubuntu-latest', part: '' };
const WINDOWS = { host: 'Windows', runner: 'windows-latest', part: '' };

describe('hosted Android source pool contract', () => {
  it('runs Android source on Ubuntu only and keeps both hosts for shared domains', () => {
    expect(portableDomainHosts(workflow, 'android-source')).toEqual([UBUNTU]);
    expect(portableDomainHosts(workflow, 'shared')).toEqual([
      UBUNTU, { ...WINDOWS, part: 'one' }, { ...WINDOWS, part: 'two' }
    ]);
    expect(portableDomainHosts(workflow, 'android-shared')).toEqual([UBUNTU, WINDOWS]);
  });

  it('uses process isolation for the Windows shared domain that loads native SQLite', () => {
    expect(job.env.VITEST_POOL)
      .toBe("${{ inputs.domain == 'shared' && matrix.host == 'Windows' && 'forks' || 'threads' }}");
  });
});
