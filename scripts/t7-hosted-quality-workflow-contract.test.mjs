// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file) => fs.readFileSync(file, 'utf8');
const hostedSource = read('.github/workflows/t7-hosted-quality.yml');
const hosted = parse(hostedSource);
const release = parse(read('.github/workflows/t7-release.yml'));

describe('T7 hosted quality workflow contract', () => {
  it('owns the scheduled and manual dev entry above reusable T6', () => {
    expect(hosted.name).toBe('Scheduled Dev Quality');
    expect(hosted['run-name']).toBe('Scheduled Dev Quality @ ${{ github.sha }}');
    expect(hosted.on.schedule.map(({ cron }) => cron)).toEqual(['40 3 * * *', '40 14 * * *']);
    expect(hosted.on.workflow_dispatch).toEqual(null);
    expect(hosted.jobs.context.steps[0].if).toBe("github.ref != 'refs/heads/dev'");
    expect(hosted.jobs.context.outputs.reason).toBe('${{ steps.admission.outputs.reason }}');
    expect(hosted.jobs.skipped_notice.name).toBe('Scheduled dev run skipped');
    expect(hosted.jobs.skipped_notice.if).toBe("needs.context.outputs.should_run != 'true'");
    expect(hosted.jobs.skipped_notice.steps[0].run).toContain('ADMISSION_REASON');
    expect(hosted.jobs.t6_quality.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
    expect(hosted.jobs.t6_quality.with.execution_lane).toBe('dev-t7');
    expect(hosted.jobs.t6_quality.if).toBe("needs.context.outputs.should_run == 'true'");
  });

  it('passes its own run ID to the admission so it is never counted as an active run', () => {
    const admission = hosted.jobs.context.steps.find((step) => step.id === 'admission');
    expect(admission.run).toBe('node scripts/quality/t7-hosted-quality-admission.mjs');
    expect(admission.env.FOLIOLE_QUALITY_RUN_ID).toBe('${{ github.run_id }}');
    expect(admission.env.FOLIOLE_QUALITY_TARGET_SHA).toBe('${{ github.sha }}');
    expect(hosted.permissions.actions).toBe('read');
  });

  it('isolates scheduled dev, active dev, and release concurrency groups', () => {
    const remote = parse(read('.github/workflows/remote-quality.yml'));
    expect(remote.concurrency).toEqual({ group: 'quality-dev-remote', 'cancel-in-progress': true });
    expect(hosted.concurrency).toEqual({ group: 'quality-dev-scheduled', 'cancel-in-progress': false });
    expect(release.concurrency).toEqual({ group: 'quality-release', 'cancel-in-progress': true });
    const workflows = fs.readdirSync('.github/workflows').filter((file) => file.endsWith('.yml'));
    const referencing = workflows.filter((file) => read(`.github/workflows/${file}`).includes('quality-release'));
    expect(referencing).toEqual(['t7-release.yml']);
    expect(workflows.some((file) => read(`.github/workflows/${file}`).includes('foliole-t7-exclusive'))).toBe(false);
  });

  it('scopes reusable quality job groups to the calling run', () => {
    const workflows = fs.readdirSync('.github/workflows').filter((file) => file.endsWith('.yml'));
    const inner = workflows.flatMap((file) => read(`.github/workflows/${file}`).split('\n')
      .filter((line) => /^\s+group: (quality|t6|rc)-\$\{\{/u.test(line)).map((line) => `${file}:${line.trim()}`));
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.filter((line) => !line.endsWith('-${{ github.run_id }}'))).toEqual([]);
  });
});
