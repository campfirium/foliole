// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/release-windows.yml', 'utf8');
const workflow = parse(source);

describe('release Windows workflow contract', () => {
  it('is a reusable-only package producer with Azure secrets explicitly allowed', () => {
    expect(workflow.name).toBe('Release Windows Package');
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(Object.keys(workflow.on.workflow_call.secrets)).toEqual([
      'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID'
    ]);
    expect(workflow.on.workflow_call.outputs.artifact_name.value)
      .toBe('${{ jobs.release-windows.outputs.artifact_name }}');
    expect(workflow.on.workflow_call.outputs.packaged_sha.value)
      .toBe('${{ jobs.release-windows.outputs.packaged_sha }}');
  });

  it('keeps least privilege and one exact lane/ref/SHA/version identity', () => {
    expect(workflow.permissions).toEqual({
      'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
    });
    expect(source).toContain('group: package-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-windows');
    expect(source).toContain('TARGET_REF: ${{ inputs.trigger_ref }}');
    expect(source).toContain('RUN_SHA: ${{ github.sha }}');
    expect(source).toContain('ref: ${{ inputs.target_sha }}');
    expect(source).not.toContain('artifact_only');
  });

  it('preserves signing, install smoke, checksum, validation kit, and attestation', () => {
    for (const command of [
      'uses: azure/login@v3',
      'write-artifact-signing-builder-config.mjs',
      'npm run windows:package',
      'verify-artifact-signatures.mjs --root artifacts/windows/win-unpacked',
      'desktop-update-packaged-identity.mjs',
      'ref: v${{ inputs.updater_baseline_version }}',
      'desktop-update-compatibility-gate.mjs',
      'desktop-update-artifact-contract.mjs',
      'node scripts/windows/package-windows.mjs --install-existing',
      'node scripts/windows/installed-app-smoke.mjs',
      'node scripts/windows/windows-validation-kit-build.mjs build',
      'uses: actions/attest@v4'
    ]) expect(source).toContain(command);
    expect(source).toContain('name: foliole-windows-release');
  });

  it('never mutates a GitHub Release or consumes committed release notes', () => {
    for (const rejected of [
      'contents: write', 'GH_TOKEN', 'gh release', 'releases/github/', 'Copy reviewed release body'
    ]) expect(source).not.toContain(rejected);
  });
});
