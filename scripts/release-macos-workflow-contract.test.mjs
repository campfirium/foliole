// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/release-macos.yml', 'utf8');
const workflow = parse(source);

describe('release macOS workflow contract', () => {
  it('is a reusable-only package producer with an explicit secret allowlist', () => {
    expect(workflow.name).toBe('Release macOS Package');
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(Object.keys(workflow.on.workflow_call.secrets)).toEqual([
      'APPLE_API_ISSUER',
      'APPLE_API_KEY_ID',
      'APPLE_NOTARY_API_KEY_BASE64',
      'MACOS_CLI_DEVELOPER_ID_PROFILE_BASE64',
      'MACOS_DEVELOPER_ID_CERTIFICATE_BASE64',
      'MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD',
      'MACOS_DEVELOPER_ID_PROFILE_BASE64'
    ]);
    expect(workflow.on.workflow_call.outputs.artifact_name.value)
      .toBe('${{ jobs.release-macos.outputs.artifact_name }}');
    expect(workflow.on.workflow_call.outputs.packaged_sha.value)
      .toBe('${{ jobs.release-macos.outputs.packaged_sha }}');
  });

  it('keeps least privilege, exact target guards, and arm64 isolation', () => {
    expect(workflow.permissions).toEqual({
      'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
    });
    expect(source).toContain('group: package-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-macos');
    expect(source).toContain('TARGET_REF: ${{ inputs.trigger_ref }}');
    expect(source).toContain('RUN_SHA: ${{ github.sha }}');
    expect(source).toContain('ref: ${{ inputs.target_sha }}');
    expect(source).toContain('"$(uname -m)" != "arm64"');
  });

  it('signs, notarizes, verifies, attests, and uploads updater artifacts only', () => {
    expect(source).toContain('security create-keychain');
    expect(source).toContain('security set-key-partition-list');
    expect(source).toContain('npm run macos:github:notarize');
    expect(source).toContain('node scripts/desktop-update-artifact-contract.mjs');
    expect(source).toContain('node scripts/desktop-update-packaged-identity.mjs');
    expect(source).toContain('--notarized');
    expect(source).toContain('ref: v${{ inputs.updater_baseline_version }}');
    expect(source).toContain('scripts/quality/hosted-npm-ci.mjs" --ignore-scripts');
    expect(source).toContain('node node_modules/electron/install.js');
    expect(source).toContain('desktop-update-compatibility-gate.mjs');
    expect(source).toContain('--electron=".tmp/updater-baseline/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"');
    expect(source).toContain('--updater-module=".tmp/updater-baseline/node_modules/electron-updater"');
    expect(source).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(source).toContain('uses: actions/attest@v4');
    for (const artifact of ['*.dmg', '*.zip', '*.blockmap', 'latest-mac.yml', 'SHA256SUMS.txt']) {
      expect(source).toContain(artifact);
    }
    expect(source).toContain('name: foliole-macos-release');
    expect(source).not.toContain('gh release');
    expect(source).not.toContain('contents: write');
  });
});
