// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/release-macos.yml', 'utf8');

describe('release macOS workflow contract', () => {
  it('packages only an exact checked-out commit on an arm64 runner', () => {
    expect(workflow).toContain('release_ref:');
    expect(workflow).toContain('ref: ${{ inputs.release_ref }}');
    expect(workflow).toContain('^[0-9a-f]{40}$');
    expect(workflow).toContain('head_sha="$(git rev-parse HEAD)"');
    expect(workflow).toContain('runs-on: macos-15');
    expect(workflow).toContain('"$(uname -m)" != "arm64"');
  });

  it('installs isolated Apple credentials without publishing them', () => {
    expect(workflow).toContain('MACOS_DEVELOPER_ID_CERTIFICATE_BASE64');
    expect(workflow).toContain('MACOS_DEVELOPER_ID_PROFILE_BASE64');
    expect(workflow).toContain('MACOS_CLI_DEVELOPER_ID_PROFILE_BASE64');
    expect(workflow).toContain('APPLE_NOTARY_API_KEY_BASE64');
    expect(workflow).toContain('security create-keychain');
    expect(workflow).toContain('security set-key-partition-list');
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
