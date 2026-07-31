// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = fs.readFileSync('.github/workflows/publish-release.yml', 'utf8');
const parsedWorkflow = parse(workflow);

describe('publish release workflow contract', () => {
  it('binds the assembly run and both artifact sets to one version and SHA', () => {
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_version).toMatchObject({ required: true, type: 'string' });
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_sha).toMatchObject({ required: true, type: 'string' });
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
    expect(workflow).toContain('run: node scripts/release-target-contract.mjs');
    expect(workflow).toContain('completed\\tsuccess\\t');
    expect(workflow).toContain('$target_sha');
    expect(workflow).toContain('foliole-macos-release');
    expect(workflow).toContain('foliole-windows-release');
    expect(workflow.match(/run-id: \$\{\{ inputs\./gu)).toHaveLength(2);
    expect(parsedWorkflow.on.workflow_dispatch.inputs).not.toHaveProperty('macos_sha');
    expect(parsedWorkflow.on.workflow_dispatch.inputs).not.toHaveProperty('windows_sha');
  });

  it('verifies updater assets and checksums before creating a draft', () => {
    expect(workflow).toContain('sha256sum --check SHA256SUMS.txt');
    expect(workflow).toContain('latest-mac.yml');
    expect(workflow).toContain('latest.yml');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('--draft');
    expect(workflow).toContain('--target "${{ inputs.target_sha }}"');
    expect(workflow).not.toContain('gh release edit');
  });
});
