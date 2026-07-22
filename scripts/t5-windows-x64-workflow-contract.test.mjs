// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const windowsJob = workflow.slice(
  workflow.indexOf('  windows-quality:'),
  workflow.indexOf('  ubuntu-quality:')
);

describe('T5 Windows quality workflow contract', () => {
  it('runs the read-only Windows x64 layer through the selected T5 host', () => {
    expect(windowsJob).toContain("inputs.scope == 'desktop'");
    expect(windowsJob).toContain("inputs.full_host == 'windows'");
    expect(windowsJob).toContain('runs-on: windows-latest');
    expect(windowsJob).toContain('FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: "1"');
    expect(windowsJob).toContain('persist-credentials: false');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('secrets.');
  });

  it('binds checkout, context verification, evidence, and artifact name to the target SHA', () => {
    expect(windowsJob).toContain('ref: ${{ env.TARGET_SHA }}');
    expect(windowsJob).toContain('Checked out SHA does not match TARGET_SHA');
    expect(windowsJob).toContain('GITHUB_SHA: ${{ env.TARGET_SHA }}');
    expect(windowsJob).toContain('node scripts/windows/windows-ci-evidence.mjs verify');
    expect(windowsJob).toContain('node scripts/windows/windows-ci-evidence.mjs write');
    expect(windowsJob).toContain('name: windows-x64-ci-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
  });

  it('runs hardening, native ABI, canonical targets, and Playwright once in fixed order', () => {
    const commands = [
      'run: npm ci',
      'run: npm run deps:hardening:check',
      'npm run electron:rebuild:native',
      'node scripts/electron-sqlite-runner.mjs --preflight',
      'run: npm run quality:desktop',
      'run: npm run quality:release:base',
      'run: npm run quality:release:windows:tail',
      'run: node scripts/windows/windows-ci-playwright-profile.mjs'
    ];
    for (let index = 1; index < commands.length; index += 1) {
      expect(windowsJob.indexOf(commands[index - 1])).toBeLessThan(windowsJob.indexOf(commands[index]));
    }
    expect(windowsJob.match(/npm run quality:release:base/gu)).toHaveLength(1);
    expect(windowsJob).not.toContain('npm run test:windows:core');
    expect(windowsJob).not.toContain('npm run build');
    expect(windowsJob).not.toContain('npm run electron:compile');
  });

  it('records the merged canonical step outcomes and preserves artifacts', () => {
    for (const outcome of [
      'DEPENDENCY_HARDENING_OUTCOME: ${{ steps.dependency_hardening.outcome }}',
      'DESKTOP_QUALITY_OUTCOME: ${{ steps.desktop_quality.outcome }}',
      'RELEASE_BASE_OUTCOME: ${{ steps.release_base.outcome }}',
      'WINDOWS_TAIL_OUTCOME: ${{ steps.windows_tail.outcome }}',
      'PLAYWRIGHT_OUTCOME: ${{ steps.playwright.outcome }}'
    ]) {
      expect(windowsJob).toContain(outcome);
    }
    expect(windowsJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
    expect(windowsJob).toContain('uses: actions/upload-artifact@v4');
    expect(windowsJob).not.toContain('continue-on-error');
  });

  it('records medium and full-only steps as explicit success or skipped outcomes', () => {
    expect(windowsJob).toContain("if: inputs.scope == 'desktop'");
    expect(windowsJob.match(/if: inputs\.scope == 'full'/gu)).toHaveLength(3);
    expect(windowsJob).toContain('DESKTOP_QUALITY_OUTCOME: ${{ steps.desktop_quality.outcome }}');
    expect(windowsJob).toContain('RELEASE_BASE_OUTCOME: ${{ steps.release_base.outcome }}');
  });

  it('does not absorb packaging, signing, publishing, or attestation', () => {
    for (const rejected of [
      'windows:package',
      'installed-app-smoke',
      'actions/attest',
      'gh release',
      'CSC_',
      'id-token: write'
    ]) {
      expect(workflow).not.toContain(rejected);
    }
  });
});
