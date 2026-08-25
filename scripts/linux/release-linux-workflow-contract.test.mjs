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

it('accepts a dev candidate or only the exact current release head manually', async () => {
  const source = await readFile('.github/workflows/release-linux.yml', 'utf8');
  const workflow = parse(source);
  const dispatchInputs = workflow.on.workflow_dispatch.inputs;

  expect(Object.keys(dispatchInputs)).toEqual(['target_sha', 'target_version']);
  expect(dispatchInputs.target_sha).toEqual({
    description: 'Dev candidate commit or exact current release HEAD to package and accept',
    required: true,
    type: 'string'
  });
  expect(workflow.permissions).toEqual({
    'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
  });
  expect(source).toContain("ref: ${{ inputs.execution_lane == '' && github.ref || inputs.target_sha }}");
  expect(source).toContain('case "$GITHUB_REF" in');
  expect(source).toContain('refs/heads/dev)');
  expect(source).toContain('git merge-base --is-ancestor "$TARGET_SHA" HEAD');
  expect(source).toContain('refs/heads/release)');
  expect(source).toContain('git ls-remote origin refs/heads/release');
  expect(source).toContain('test "$remote_sha" = "$TARGET_SHA"');
  expect(source).toContain('Manual Linux acceptance requires dev or release');
  expect(source).toContain("if: inputs.execution_lane != '' && inputs.attest_artifact");
  expect(source).not.toContain('contents: write');
});

it('registers one active hard-gated manual-update Linux Experimental producer', async () => {
  const registry = JSON.parse(await readFile('.github/release-platforms.json', 'utf8'));
  const linux = registry.platforms.find((platform) => platform.id === 'linux');

  expect(linux).toMatchObject({
    architectures: ['x64'], artifactContract: 'deb', deliveryChannel: 'github-release',
    displayName: 'Linux Experimental', status: 'active', t7Required: true,
    update: { baselineVersion: null, mode: 'manual' }
  });
  expect(linux.managedAssets).toEqual([
    'Foliole-Linux-Experimental-amd64-{version}.deb', 'SHA256SUMS-linux.txt'
  ]);
  expect(JSON.stringify(linux)).not.toMatch(/AppImage|latest-linux\.yml/u);
});
