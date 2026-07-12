// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/windows-x64-ci.yml', 'utf8');

function expectOrdered(values) {
  for (let index = 1; index < values.length; index += 1) {
    expect(workflow.indexOf(values[index - 1])).toBeLessThan(workflow.indexOf(values[index]));
  }
}

describe('Windows x64 CI workflow contract', () => {
  it('runs an independent read-only Windows x64 layer on the intended triggers', () => {
    expect(workflow).toContain('name: Windows x64 CI');
    expect(workflow).toContain('push:\n    branches:\n      - dev');
    expect(workflow).toContain('pull_request:\n    branches:\n      - dev');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: "1"');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('pull_request_target');
  });

  it('binds checkout, context verification, evidence, and artifact name to github.sha', () => {
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('node scripts/windows/windows-ci-evidence.mjs verify');
    expect(workflow).toContain('GITHUB_SHA: ${{ github.sha }}');
    expect(workflow).toContain('node scripts/windows/windows-ci-evidence.mjs write');
    expect(workflow).toContain('name: windows-x64-ci-${{ github.sha }}-${{ github.run_attempt }}');
  });

  it('keeps native ABI, Windows contract, build, and Playwright in fixed order', () => {
    expectOrdered([
      'run: npm ci',
      'npm run electron:rebuild:native',
      'node scripts/electron-sqlite-runner.mjs --preflight',
      'run: npm run test:windows:core',
      'npm run build',
      'npm run electron:compile',
      'run: node scripts/windows/windows-ci-playwright-profile.mjs'
    ]);
    expect(workflow.match(/npm run build/gu)).toHaveLength(1);
  });

  it('always preserves explicit evidence paths without weakening failures', () => {
    expect(workflow.match(/if: \$\{\{ always\(\) \}\}/gu)).toHaveLength(2);
    expect(workflow).toContain('CONTEXT_OUTCOME: ${{ steps.context.outcome }}');
    expect(workflow).toContain('NPM_CI_OUTCOME: ${{ steps.npm_ci.outcome }}');
    expect(workflow).toContain('PLAYWRIGHT_OUTCOME: ${{ steps.playwright.outcome }}');
    expect(workflow).toContain('uses: actions/upload-artifact@v4');
    for (const artifactPath of [
      '.tmp/artifacts/windows-ci-evidence',
      '.tmp/playwright-results/desktop',
      '.tmp/playwright-report/desktop',
      '.tmp/artifacts/desktop-acceptance'
    ]) {
      expect(workflow).toContain(artifactPath);
    }
    expect(workflow).not.toContain('continue-on-error');
  });

  it('does not absorb release, installer, signing, or attestation duties', () => {
    for (const rejected of [
      'quality:release',
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
