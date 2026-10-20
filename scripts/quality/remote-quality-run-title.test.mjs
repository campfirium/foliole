// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { parseRemoteQualityRun } from './remote-quality-run-title.mjs';

const HEAD = '3c2a68dfc'.padEnd(40, '0');
const TARGET = 'a'.repeat(40);
const run = (display_title, head_sha = HEAD) => ({ display_title, head_sha });

describe('remote quality run titles', () => {
  it('takes the full commit from head_sha for a new short full title', () => {
    expect(parseRemoteQualityRun(run('Dev Quality Check (full) @ 3c2a68dfc')))
      .toEqual({ scope: 'full', testedSha: HEAD });
  });

  it('takes the full target from a new replay title whose via prefixes head_sha', () => {
    expect(parseRemoteQualityRun(run(`Dev Quality Check (replay) @ ${TARGET} via 3c2a68dfc`)))
      .toEqual({ scope: 'replay', testedSha: TARGET });
  });

  it('keeps reading old titles with full target and via', () => {
    expect(parseRemoteQualityRun(run(`Dev Quality Check (shared) @ ${TARGET} via ${HEAD}`)))
      .toEqual({ scope: 'shared', testedSha: TARGET });
    expect(parseRemoteQualityRun(run(`Dev Quality Check (full) @ ${HEAD} via ${HEAD}`)))
      .toEqual({ scope: 'full', testedSha: HEAD });
  });

  it.each([
    ['short title of another commit', 'Dev Quality Check (full) @ 3c2a68dfd'],
    ['short via of another commit', `Dev Quality Check (replay) @ ${TARGET} via 3c2a68dfd`],
    ['old via of another commit', `Dev Quality Check (full) @ ${TARGET} via ${'b'.repeat(40)}`],
    ['short target with via', 'Dev Quality Check (replay) @ 3c2a68dfc via 3c2a68dfc'],
    ['short SHA of the wrong length', 'Dev Quality Check (full) @ 3c2a68d'],
    ['unknown workflow', 'Scheduled Dev Quality @ 3c2a68dfc']
  ])('rejects a %s', (_label, title) => {
    expect(parseRemoteQualityRun(run(title))).toBeNull();
  });

  it('rejects a short title when the run has no full head_sha', () => {
    expect(parseRemoteQualityRun(run('Dev Quality Check (full) @ 3c2a68dfc', '3c2a68dfc'))).toBeNull();
    expect(parseRemoteQualityRun({ display_title: 'Dev Quality Check (full) @ 3c2a68dfc' })).toBeNull();
  });
});

describe('remote quality workflow run-name', () => {
  const workflow = parse(readFileSync('.github/workflows/remote-quality.yml', 'utf8'));

  it('shortens only through a trigger_short that prefixes github.sha and keeps the full fallback', () => {
    const name = workflow['run-name'];
    expect(workflow.on.workflow_dispatch.inputs.trigger_short).toMatchObject({ default: '', required: false });
    expect(name).toContain("startsWith(github.sha, inputs.trigger_short) && inputs.target_sha == github.sha");
    expect(name).toContain("format('{0} via {1}', inputs.target_sha, inputs.trigger_short)");
    expect(name).toContain("format('{0} via {1}', inputs.target_sha, github.sha) }}");
  });
});
