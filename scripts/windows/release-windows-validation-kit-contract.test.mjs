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
  it('builds and verifies the kit before attestation and draft publication', () => {
    expectOrdered([
      'write-artifact-signing-builder-config.mjs',
      'npm run windows:package',
      'Verify application and installer signatures',
      'Install signed Windows installer',
      'node scripts/windows/installed-app-smoke.mjs',
      'Generate installer checksum',
      'node scripts/windows/windows-validation-kit-build.mjs build',
      'actions/attest@v4',
      'gh release create'
    ]);
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}');
    expect(workflow).toContain('GITHUB_RUN_ID: ${{ github.run_id }}');
  });

  it('uploads the kit with the installer and required updater metadata', () => {
    expect(workflow).toContain('artifacts/windows/validation-kit');
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).toContain('gh release create $tagName $installer.FullName $blockmap.FullName $updateMetadata.FullName $checksums.FullName --draft');
    expect(workflow).not.toMatch(/gh release create[^\n]+validation-kit/u);
    expect(workflow.match(/permissions:/gu)).toHaveLength(1);
    expect(workflow.match(/secrets\./gu)).toHaveLength(7);
  });

  it('supports a fixed-SHA artifact-only run without touching a draft release', () => {
    expect(workflow).toContain('artifact_only:');
    expect(workflow).toContain('type: boolean');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_VERSION: ${{ inputs.target_version }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_SHA: ${{ inputs.target_sha }}');
    expect(workflow).toContain('node scripts/release-target-contract.mjs');
    expect(workflow.match(/if: \$\{\{ !inputs\.artifact_only \}\}/gu)).toHaveLength(2);
    expect(workflow.indexOf('if: ${{ !inputs.artifact_only }}')).toBeLessThan(workflow.indexOf('gh release create'));
  });

  it('uses the same immutable target contract for formal and artifact-only modes', () => {
    expect(workflow).toContain('target_version:');
    expect(workflow).toContain('target_sha:');
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).not.toContain('release_ref:');
  });
});
