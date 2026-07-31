// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = fs.readFileSync('.github/workflows/release-macos.yml', 'utf8');
const parsedWorkflow = parse(workflow);

describe('release macOS workflow contract', () => {
  it('packages only a declared version and exact run SHA on an arm64 runner', () => {
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_version).toMatchObject({ required: true, type: 'string' });
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_sha).toMatchObject({ required: true, type: 'string' });
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_VERSION: ${{ inputs.target_version }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_SHA: ${{ inputs.target_sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
    expect(workflow).toContain('run: node scripts/release-target-contract.mjs');
    expect(workflow).toContain('runs-on: macos-15');
    expect(workflow).toContain('"$(uname -m)" != "arm64"');
    expect(workflow).not.toContain('release_ref:');
  });

  it('installs isolated Apple credentials without publishing them', () => {
    expect(workflow).toContain('MACOS_DEVELOPER_ID_CERTIFICATE_BASE64');
    expect(workflow).toContain('MACOS_DEVELOPER_ID_PROFILE_BASE64');
    expect(workflow).toContain('MACOS_CLI_DEVELOPER_ID_PROFILE_BASE64');
    expect(workflow).toContain('APPLE_NOTARY_API_KEY_BASE64');
    expect(workflow).toContain('security create-keychain');
    expect(workflow).toContain('security set-key-partition-list');
    expect(workflow).toContain('apple_api_key="$RUNNER_TEMP/AuthKey.p8"');
    expect(workflow).toContain('echo "APPLE_API_KEY=$apple_api_key" >> "$GITHUB_ENV"');
    expect(workflow).not.toContain('${{ runner.temp }}');
    expect(workflow).not.toContain('gh release create');
  });

  it('signs, notarizes, verifies, attests, and uploads updater artifacts', () => {
    expect(workflow).toContain('npm run macos:github:notarize');
    expect(workflow).toContain('uses: actions/attest@v4');
    expect(workflow).toContain('artifacts/macos/github-arm64/*.dmg');
    expect(workflow).toContain('artifacts/macos/github-arm64/*.zip');
    expect(workflow).toContain('artifacts/macos/github-arm64/*.blockmap');
    expect(workflow).toContain('artifacts/macos/github-arm64/latest-mac.yml');
    expect(workflow).toContain('artifacts/macos/github-arm64/SHA256SUMS.txt');
    expect(workflow).toContain('name: foliole-macos-release');
  });
});
