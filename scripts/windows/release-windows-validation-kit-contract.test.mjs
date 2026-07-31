// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/release-windows.yml', 'utf8');

function expectOrdered(values) {
  for (let index = 1; index < values.length; index += 1) {
    expect(workflow.indexOf(values[index - 1])).toBeLessThan(workflow.indexOf(values[index]));
  }
}

describe('Windows release validation kit contract', () => {
  it('builds and verifies the kit before attestation and artifact upload', () => {
    expectOrdered([
      'write-artifact-signing-builder-config.mjs',
      'npm run windows:package',
      'Verify application and installer signatures',
      'Install signed Windows installer',
      'node scripts/windows/installed-app-smoke.mjs',
      'Generate installer checksum',
      'node scripts/windows/windows-validation-kit-build.mjs build',
      'actions/attest@v4',
      'Upload installer artifacts'
    ]);
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}');
    expect(workflow).toContain('GITHUB_RUN_ID: ${{ github.run_id }}');
  });

  it('uploads the kit with the installer and required updater metadata', () => {
    expect(workflow).toContain('artifacts/windows/validation-kit');
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).not.toContain('gh release');
    expect(workflow.match(/permissions:/gu)).toHaveLength(1);
    expect(workflow.match(/secrets\./gu)).toHaveLength(6);
  });

  it('is reusable-only and leaves draft ownership to the T7 assembly job', () => {
    expect(workflow).toContain('workflow_call:');
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow).not.toContain('artifact_only:');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('GH_TOKEN');
  });

  it('uses the same immutable target contract throughout the reusable producer', () => {
    expect(workflow).toContain('target_version:');
    expect(workflow).toContain('target_sha:');
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).toContain('RUN_SHA: ${{ github.sha }}');
    expect(workflow).toContain('TARGET_REF: ${{ inputs.trigger_ref }}');
    expect(workflow).not.toContain('release_ref:');
  });
});
