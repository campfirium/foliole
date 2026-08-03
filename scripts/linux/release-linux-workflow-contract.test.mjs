// @vitest-environment node

import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('keeps the reusable Linux job on an installed Ubuntu 24.04 DEB contract', async () => {
  const workflow = await readFile('.github/workflows/release-linux.yml', 'utf8');
  expect(workflow).toContain('runs-on: ubuntu-24.04');
  expect(workflow).toContain('node scripts/linux/package-linux-deb.mjs');
  expect(workflow).toContain('node scripts/linux/accept-linux-deb.mjs');
  expect(workflow).toContain('artifacts/linux/*.deb');
  expect(workflow).toContain('subject-checksums: artifacts/linux/SHA256SUMS.txt');
  expect(workflow).not.toContain('AppImage');
  expect(workflow).not.toContain('latest-linux.yml');
  expect(workflow).not.toContain('gh release');
});

it('exposes only a guarded dev candidate manual entry', async () => {
  const source = await readFile('.github/workflows/release-linux.yml', 'utf8');
  const workflow = parse(source);
  const dispatchInputs = workflow.on.workflow_dispatch.inputs;

  expect(Object.keys(dispatchInputs)).toEqual(['target_sha', 'target_version']);
  expect(dispatchInputs.target_sha).toEqual({
    description: 'Exact dev candidate commit to package and accept',
    required: true,
    type: 'string'
  });
  expect(workflow.permissions).toEqual({
    'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
  });
  expect(source).toContain("test \"$GITHUB_REF\" = 'refs/heads/dev'");
  expect(source).toContain('git merge-base --is-ancestor "$TARGET_SHA" HEAD');
  expect(source).toContain("if: inputs.execution_lane != '' && inputs.attest_artifact");
  expect(source).not.toContain('contents: write');
});
