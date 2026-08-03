// @vitest-environment node

import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('adds installed Linux DEB acceptance to dev remote desktop quality without attestation', async () => {
  const workflow = parse(await readFile('.github/workflows/hosted-quality-core.yml', 'utf8'));
  const remote = parse(await readFile('.github/workflows/remote-quality.yml', 'utf8'));
  const job = workflow.jobs['linux-package-acceptance'];

  expect(job.if).toBe("inputs.scope == 'desktop'");
  expect(job.uses).toBe('./.github/workflows/release-linux.yml');
  expect(job.with.target_sha).toBe('${{ inputs.target_sha }}');
  expect(job.with.execution_lane).toBe('${{ inputs.execution_lane }}');
  expect(job.with.attest_artifact).toBe(false);
  expect(job.permissions).toEqual({
    'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
  });
  expect(remote.jobs['scoped-quality'].permissions).toEqual({
    'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
  });
});
