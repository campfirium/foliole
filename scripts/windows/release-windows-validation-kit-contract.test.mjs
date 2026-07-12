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
      'npm run windows:package:install',
      'node scripts/windows/installed-app-smoke.mjs',
      'Generate installer checksum',
      'node scripts/windows/windows-validation-kit-build.mjs build',
      'actions/attest@v4',
      'gh release create'
    ]);
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}');
    expect(workflow).toContain('GITHUB_RUN_ID: ${{ github.run_id }}');
  });

  it('uploads the kit with the installer without expanding release assets or permissions', () => {
    expect(workflow).toContain('artifacts/windows/validation-kit');
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).toContain('gh release create $tagName $installer.FullName $checksums.FullName --draft');
    expect(workflow).not.toMatch(/gh release create[^\n]+validation-kit/u);
    expect(workflow.match(/permissions:/gu)).toHaveLength(1);
    expect(workflow.match(/secrets\./gu)).toHaveLength(1);
  });
});
