// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const core = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const full = fs.readFileSync('.github/workflows/hosted-quality-full.yml', 'utf8');
const t5 = fs.readFileSync('.github/workflows/t5-baseline-admission.yml', 'utf8');
const t5WindowsCore = fs.readFileSync('.github/workflows/hosted-quality-windows-core.yml', 'utf8');
const coreWorkflow = parse(core);
const t5Workflow = parse(t5);
const acceptanceJob = full.slice(
  full.indexOf('  windows-acceptance:'),
  full.indexOf('  android-host:')
);

describe('hosted Windows x64 workflow contract', () => {
  it('keeps T4 desktop diagnosis independent from T5 and T6', () => {
    const scoped = coreWorkflow.jobs['desktop-windows-core'];
    const baseline = t5Workflow.jobs['windows-core'];
    expect(scoped.if).toBe("inputs.scope == 'desktop'");
    expect(scoped.uses).toBe('./.github/workflows/hosted-quality-windows-core.yml');
    expect(scoped.uses).toBe(baseline.uses);
    expect(scoped.with).toEqual(baseline.with);
    expect(core).not.toContain('VITEST_DESKTOP_POOL');
    expect(core).not.toContain('npm run quality:desktop');
  });

  it('runs Windows core in T5 and native acceptance in T6', () => {
    expect(t5).toContain('uses: ./.github/workflows/hosted-quality-windows-core.yml');
    expect(t5WindowsCore).toContain('runs-on: windows-latest');
    expect(t5WindowsCore).toContain('run: npm run quality:release:windows:core');
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

  it('binds canonical core and acceptance work to the target SHA', () => {
    expect(t5WindowsCore).toContain('ref: ${{ env.TARGET_SHA }}');
    expect(t5WindowsCore).toContain('Checked out SHA does not match TARGET_SHA');
    expect(acceptanceJob).toContain('ref: ${{ env.TARGET_SHA }}');
    expect(acceptanceJob).toContain('Checked out SHA does not match TARGET_SHA');
    expect(acceptanceJob).toContain('GITHUB_SHA: ${{ env.TARGET_SHA }}');
    expect(acceptanceJob).toContain('node scripts/windows/windows-ci-evidence.mjs verify');
    expect(acceptanceJob).toContain('node scripts/windows/windows-ci-evidence.mjs write');
    expect(acceptanceJob).toContain('name: windows-acceptance-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
  });

  it('records only the outcomes owned by Windows acceptance', () => {
    expect(acceptanceJob).toContain('DESKTOP_BUILD_OUTCOME: ${{ steps.desktop_build.outcome }}');
    expect(acceptanceJob).toContain('WINDOWS_TAIL_OUTCOME: ${{ steps.windows_tail.outcome }}');
    expect(acceptanceJob).toContain('PLAYWRIGHT_OUTCOME: ${{ steps.playwright.outcome }}');
    expect(acceptanceJob.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
  });

  it('does not absorb packaging, signing, publishing, or attestation', () => {
    for (const rejected of [
      'windows:package', 'installed-app-smoke', 'actions/attest',
      'gh release', 'CSC_', 'id-token: write'
    ]) expect(`${t5WindowsCore}\n${acceptanceJob}`).not.toContain(rejected);
  });
});
