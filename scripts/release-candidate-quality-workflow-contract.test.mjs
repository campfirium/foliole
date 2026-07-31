// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = fs.readFileSync('.github/workflows/release-candidate-quality.yml', 'utf8');
const parsedWorkflow = parse(workflow);

describe('release candidate quality workflow contract', () => {
  it('validates explicit manual targets and exact release push commits', () => {
    expect(workflow).toContain('name: Release Candidate Quality');
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_version).toMatchObject({ required: true, type: 'string' });
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_sha).toMatchObject({ required: true, type: 'string' });
    expect(workflow).toContain('"release/**"');
    expect(workflow).toContain('ref: ${{ inputs.target_sha || github.sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_SHA: ${{ inputs.target_sha || github.sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_VERSION: ${{ inputs.target_version }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
    expect(workflow).toContain('run: node scripts/release-target-contract.mjs');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).not.toContain('release_ref:');
  });

  it('runs the full release-base gate on Windows with native sqlite preflight', () => {
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('npm run electron:rebuild:native');
    expect(workflow).toContain('node scripts/electron-sqlite-runner.mjs --preflight');
    expect(workflow.indexOf('npm run electron:rebuild:native')).toBeLessThan(
      workflow.indexOf('npm run quality:release:base')
    );
    expect(workflow).toContain('run: npm run quality:release:base');
  });

  it('runs desktop golden journey acceptance after release base quality', () => {
    expect(workflow).toContain('name: Run desktop golden journey acceptance');
    expect(workflow).toContain('FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: "1"');
    expect(workflow).toContain('run: npm run test:e2e:desktop:rc-golden-journey');
    expect(workflow.indexOf('run: npm run quality:release:base')).toBeLessThan(
      workflow.indexOf('run: npm run test:e2e:desktop:rc-golden-journey')
    );
    expect(workflow).not.toContain('continue-on-error: true');
  });

  it('stays read-only and does not publish release artifacts', () => {
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('group: release-candidate-quality-${{ inputs.target_sha || github.sha }}');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('gh release');
    expect(workflow).not.toContain('actions/upload-artifact');
    expect(workflow).not.toContain('actions/attest');
    expect(workflow).not.toContain('softprops/action-gh-release');
    expect(workflow).not.toContain('ncipollo/release-action');
  });
});
