// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const core = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const full = fs.readFileSync('.github/workflows/hosted-quality-full.yml', 'utf8');
const t5 = fs.readFileSync('.github/workflows/t5-baseline-admission.yml', 'utf8');
const windowsJob = core.slice(core.indexOf('  windows-quality:'), core.indexOf('  linux-package-acceptance:'));
const acceptanceJob = full.slice(
  full.indexOf('  windows-acceptance:'),
  full.indexOf('  android-host:')
);

describe('hosted Windows x64 workflow contract', () => {
  it('keeps T4 desktop diagnosis independent from T5 and T6', () => {
    expect(windowsJob).toContain("if: inputs.scope == 'desktop'");
    expect(windowsJob).toContain('runs-on: windows-latest');
    expect(windowsJob).toContain('FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: "1"');
    expect(windowsJob).toContain('persist-credentials: false');
    expect(windowsJob).toContain('VITEST_DESKTOP_POOL: forks');
    expect(windowsJob).toContain('run: npm run quality:desktop');
    expect(windowsJob).not.toContain('quality:release:windows:core');
    expect(windowsJob).not.toContain('quality:release:windows:tail');
    expect(windowsJob).not.toContain('windows-ci-playwright-profile.mjs');
  });

  it('runs Windows core in T5 and native acceptance in T6', () => {
    expect(t5).toContain('runs-on: windows-latest');
    expect(t5).toContain('run: npm run quality:release:windows:core');
    expect(acceptanceJob).toContain('runs-on: windows-latest');
    expect(acceptanceJob).toContain('npm run build:vite-only');
    expect(acceptanceJob).toContain('npm run electron:compile');
    expect(acceptanceJob).toContain('run: npm run quality:release:windows:tail');
    expect(acceptanceJob).toContain('run: node scripts/windows/windows-ci-playwright-profile.mjs');
    expect(acceptanceJob).not.toContain('quality:release:windows:core');
    expect(acceptanceJob.indexOf('npm run electron:compile')).toBeLessThan(
      acceptanceJob.indexOf('run: node scripts/windows/windows-ci-playwright-profile.mjs')
    );
  });

  it('binds scoped and acceptance evidence to the target SHA', () => {
    for (const job of [windowsJob, acceptanceJob]) {
      expect(job).toContain('ref: ${{ env.TARGET_SHA }}');
      expect(job).toContain('Checked out SHA does not match TARGET_SHA');
      expect(job).toContain('GITHUB_SHA: ${{ env.TARGET_SHA }}');
      expect(job).toContain('node scripts/windows/windows-ci-evidence.mjs verify');
      expect(job).toContain('node scripts/windows/windows-ci-evidence.mjs write');
    }
    expect(windowsJob).toContain('name: windows-core-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
    expect(acceptanceJob).toContain('name: windows-acceptance-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
  });

  it('records only the outcomes owned by each stage', () => {
    expect(windowsJob).toContain('DESKTOP_QUALITY_OUTCOME: ${{ steps.desktop_quality.outcome }}');
    expect(windowsJob).toContain('WINDOWS_CORE_OUTCOME: skipped');
    expect(acceptanceJob).toContain('DESKTOP_BUILD_OUTCOME: ${{ steps.desktop_build.outcome }}');
    expect(acceptanceJob).toContain('WINDOWS_TAIL_OUTCOME: ${{ steps.windows_tail.outcome }}');
    expect(acceptanceJob).toContain('PLAYWRIGHT_OUTCOME: ${{ steps.playwright.outcome }}');
    expect(windowsJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
    expect(acceptanceJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
  });

  it('does not absorb packaging, signing, publishing, or attestation', () => {
    for (const rejected of [
      'windows:package', 'installed-app-smoke', 'actions/attest',
      'gh release', 'CSC_', 'id-token: write'
    ]) expect(`${windowsJob}\n${acceptanceJob}`).not.toContain(rejected);
  });
});
