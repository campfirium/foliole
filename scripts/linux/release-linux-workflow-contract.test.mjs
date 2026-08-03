// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/release-linux.yml', 'utf8');
const workflow = parse(source);
const job = workflow.jobs['release-linux'];

describe('reusable Linux release workflow', () => {
  it('builds and accepts only Ubuntu 24.04 x64 AppImages', () => {
    expect(job['runs-on']).toBe('ubuntu-24.04');
    expect(source).toContain('test "$(uname -m)" = "x86_64"');
    expect(source).toContain('package-linux-appimage.mjs');
    expect(source).toContain('accept-linux-appimage.mjs');
    expect(source).toContain('artifacts/linux/*.AppImage');
    expect(source).not.toContain('latest-linux.yml');
    expect(source).not.toContain('gh release');
  });

  it('attests only when T7 explicitly requests it', () => {
    const attestation = job.steps.find((step) => step.name === 'Generate Linux artifact attestation');
    expect(attestation.if).toBe('inputs.attest_artifact');
    expect(attestation.uses).toBe('actions/attest@v4');
    expect(attestation.with['subject-checksums']).toBe('artifacts/linux/SHA256SUMS.txt');
  });
});
