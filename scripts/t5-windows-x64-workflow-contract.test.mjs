// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const windowsJob = workflow.slice(
  workflow.indexOf('  windows-quality:'),
  workflow.indexOf('  windows-acceptance:')
);
const acceptanceJob = workflow.slice(
  workflow.indexOf('  windows-acceptance:'),
  workflow.indexOf('  android-quality:')
);

describe('T5 Windows quality workflow contract', () => {
  it('runs the read-only Windows x64 layer through the selected T5 host', () => {
    expect(windowsJob).toContain("inputs.scope == 'desktop'");
    expect(windowsJob).toContain("inputs.full_host == 'windows'");
    expect(windowsJob).toContain('runs-on: windows-latest');
    expect(windowsJob).toContain('FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: "1"');
    expect(windowsJob).toContain('persist-credentials: false');
    expect(acceptanceJob).toContain("inputs.scope == 'full'");
    expect(acceptanceJob).toContain('runs-on: windows-latest');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('secrets.');
  });

  it('binds checkout, context verification, evidence, and artifact name to the target SHA', () => {
    expect(windowsJob).toContain('ref: ${{ env.TARGET_SHA }}');
    expect(windowsJob).toContain('Checked out SHA does not match TARGET_SHA');
    expect(windowsJob).toContain('GITHUB_SHA: ${{ env.TARGET_SHA }}');
    expect(windowsJob).toContain('node scripts/windows/windows-ci-evidence.mjs verify');
    expect(windowsJob).toContain('node scripts/windows/windows-ci-evidence.mjs write');
    expect(windowsJob).toContain('name: windows-core-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
    expect(acceptanceJob).toContain('name: windows-acceptance-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
  });

  it('keeps fast Windows core separate from native acceptance', () => {
    const commands = [
      'run: node scripts/quality/pinned-npm.mjs activate',
      'run: npm ci',
      'run: npm run deps:hardening:check',
      'npm run electron:rebuild:native',
      'node scripts/electron-sqlite-runner.mjs --preflight',
      'run: npm run quality:desktop',
      'run: npm run quality:release:windows:core'
    ];
    for (let index = 1; index < commands.length; index += 1) {
      expect(windowsJob.indexOf(commands[index - 1])).toBeLessThan(windowsJob.indexOf(commands[index]));
    }
    expect(windowsJob.match(/npm run quality:release:windows:core/gu)).toHaveLength(1);
    expect(windowsJob).not.toContain('npm run quality:release:hosted-common');
    expect(windowsJob).not.toContain('npm run quality:release:windows:tail');
    expect(windowsJob).not.toContain('windows-ci-playwright-profile.mjs');
    expect(acceptanceJob).toContain('npm run build:vite-only');
    expect(acceptanceJob).toContain('npm run electron:compile');
    expect(acceptanceJob).toContain('run: npm run quality:release:windows:tail');
    expect(acceptanceJob).toContain('run: node scripts/windows/windows-ci-playwright-profile.mjs');
    expect(acceptanceJob.indexOf('npm run electron:compile')).toBeLessThan(
      acceptanceJob.indexOf('run: node scripts/windows/windows-ci-playwright-profile.mjs')
    );
    expect(windowsJob).not.toContain('npm run build');
    expect(windowsJob).not.toContain('npm run electron:compile');
    expect(windowsJob).toContain("if: inputs.scope == 'desktop'");
    expect(acceptanceJob).toContain('needs: [common-quality, windows-quality]');
    expect(acceptanceJob).not.toContain('android-quality');
    expect(acceptanceJob).not.toContain('ios-contract');
  });

  it('records job-specific outcomes and preserves artifacts and logs', () => {
    for (const outcome of [
      'DEPENDENCY_HARDENING_OUTCOME: ${{ steps.dependency_hardening.outcome }}',
      'DESKTOP_QUALITY_OUTCOME: ${{ steps.desktop_quality.outcome }}',
      'WINDOWS_CORE_OUTCOME: ${{ steps.windows_core.outcome }}'
    ]) {
      expect(windowsJob).toContain(outcome);
    }
    for (const outcome of [
      'DESKTOP_BUILD_OUTCOME: ${{ steps.desktop_build.outcome }}',
      'WINDOWS_TAIL_OUTCOME: ${{ steps.windows_tail.outcome }}',
      'PLAYWRIGHT_OUTCOME: ${{ steps.playwright.outcome }}'
    ]) {
      expect(acceptanceJob).toContain(outcome);
    }
    expect(windowsJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
    expect(acceptanceJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
    expect(windowsJob).toContain('uses: actions/upload-artifact@v4');
    expect(acceptanceJob).toContain('.tmp/logs/quality-gate');
    expect(windowsJob).not.toContain('continue-on-error');
  });

  it('records medium and full-only steps as explicit success or skipped outcomes', () => {
    expect(windowsJob).toContain("if: inputs.scope == 'desktop'");
    expect(windowsJob.match(/if: inputs\.scope == 'full'/gu)).toHaveLength(1);
    expect(windowsJob).toContain('DESKTOP_QUALITY_OUTCOME: ${{ steps.desktop_quality.outcome }}');
    expect(windowsJob).toContain('WINDOWS_CORE_OUTCOME: ${{ steps.windows_core.outcome }}');
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
