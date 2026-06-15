// @vitest-environment node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/dev-push-health.yml', 'utf8');

function routeForChangedFiles(files) {
  const output = execFileSync('bash', ['scripts/quality-gate-fast.sh', '--route-json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      QUALITY_GATE_CHANGED_FILES: files.join('\n'),
    },
  });
  return JSON.parse(output);
}

describe('dev push health workflow contract', () => {
  it('runs only as dev/native-migration push or manual advisory feedback', () => {
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- dev');
    expect(workflow).toContain('- windows-native-codex-migration');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('group: branch-push-health-${{ github.event_name }}-${{ github.ref }}');
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'push' }}");
  });

  it('reuses the local quality route and writes the route to the Actions summary', () => {
    expect(workflow).toContain('bash scripts/quality-gate-fast.sh --route-json');
    expect(workflow).toContain('JSON.parse(process.env.ROUTE_JSON)');
    expect(workflow).toContain('GITHUB_STEP_SUMMARY');
    expect(workflow).toContain('QUALITY_GATE_CHANGED_FILES');
    expect(workflow).toContain('- scope: portable');
  });

  it('keeps light changes as classification-only and never runs release-grade gates', () => {
    expect(workflow).toContain("needs.classify.outputs.level != 'light'");
    expect(workflow).toContain('case "${ROUTE_LEVEL}" in');
    expect(workflow).toContain('mid)');
    expect(workflow).toContain('bash scripts/quality-gate-fast.sh');
    expect(workflow).toContain('shared)');
    expect(workflow).toContain('npm run typecheck:shared');
    expect(workflow).not.toContain('quality:release');
  });

  it('does not run desktop, android, or full host gates on GitHub hosted Linux', () => {
    expect(workflow).toContain('desktop|android|full)');
    expect(workflow).toContain('summary only; run the target in the matching local/specialized runner');
    expect(workflow).not.toContain('npm run quality:desktop');
    expect(workflow).not.toContain('npm run quality:android');
    expect(workflow).not.toContain('npm run quality:full');
  });

  it('runs Windows contract advisory for desktop or full routes', () => {
    expect(workflow).toContain('windows-contract:');
    expect(workflow).toContain("needs.classify.outputs.level == 'desktop' || needs.classify.outputs.level == 'full'");
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('- scope: windows-contract');
    expect(workflow).toContain('scripts/windows/installed-app-smoke.test.mjs');
    expect(workflow).toContain('scripts/release-windows-workflow-contract.test.mjs');
  });

  it('keeps the workflow route extraction compatible with the local route output', () => {
    expect(routeForChangedFiles(['README.md'])).toMatchObject({ level: 'light' });
    expect(routeForChangedFiles(['src/shared/platform/companionSyncNodeVersions.ts'])).toMatchObject({
      level: 'shared',
      target: 'quality:shared'
    });
    expect(routeForChangedFiles(['electron/main.ts'])).toMatchObject({
      level: 'desktop',
      target: 'quality:desktop'
    });
  }, 30000);
});
