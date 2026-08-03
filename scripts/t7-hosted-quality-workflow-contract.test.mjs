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
    expect(hosted.name).toBe('T7 Hosted Quality');
    expect(hosted['run-name']).toBe('T7 Hosted Quality (dev) @ ${{ github.sha }}');
    expect(hosted.on.schedule.map(({ cron }) => cron)).toEqual(['40 3 * * *', '40 14 * * *']);
    expect(hosted.on.workflow_dispatch).toEqual(null);
    expect(hosted.jobs.context.steps[0].if).toBe("github.ref != 'refs/heads/dev'");
    expect(hosted.jobs.context.outputs.reason).toBe('${{ steps.admission.outputs.reason }}');
    expect(hosted.jobs.skipped_notice.name).toBe('DEV T7 intentionally skipped');
    expect(hosted.jobs.skipped_notice.if).toBe("needs.context.outputs.should_run != 'true'");
    expect(hosted.jobs.skipped_notice.steps[0].run).toContain('ADMISSION_REASON');
    expect(hosted.jobs.t6_quality.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
    expect(hosted.jobs.t6_quality.with.execution_lane).toBe('dev-t7');
    expect(hosted.jobs.t6_quality.if).toBe("needs.context.outputs.should_run == 'true'");
  });

  it('pauses before T6 when a release ref exists', () => {
    expect(hostedSource).toContain('node scripts/quality/t7-hosted-quality-admission.mjs');
    expect(hostedSource).toContain('FOLIOLE_QUALITY_EVENT: ${{ github.event_name }}');
    const admission = read('scripts/quality/t7-hosted-quality-admission.mjs');
    expect(admission).toContain('git/ref/heads/release');
    expect(admission).toContain("reason: releaseActive\n      ? 'release-active'");
    expect(admission).toContain("run.conclusion === 'success'");
    expect(admission).toContain('reason=${admission.reason}');
  });

  it('shares one release-exclusive top-level concurrency group', () => {
    expect(hosted.concurrency).toEqual({
      group: 'foliole-t7-exclusive',
      'cancel-in-progress': false
    });
    expect(release.concurrency).toEqual({
      group: 'foliole-t7-exclusive',
      'cancel-in-progress': true
    });
  });
});
