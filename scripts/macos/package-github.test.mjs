import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createGithubArtifactNames,
  createGithubBuilderConfig,
  hasNotarizationCredentials,
  resolveDeveloperIdCliProvisioningProfile,
  resolveDeveloperIdProvisioningProfile,
  writeDmgChecksum
} from './package-github.mjs';

const temporaryDirectories = [];

async function makeTemporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

describe('GitHub macOS packaging', () => {
  it('builds signed arm64 DMG and ZIP artifacts with the audited sandbox signing shape', () => {
    const config = createGithubBuilderConfig({
      directories: { output: 'artifacts/windows' },
      electronDist: 'node_modules/electron/dist',
      extraFiles: [],
      extraResources: [],
      mac: { target: ['dmg'] }
    }, {
      codexPath: '.tmp/codex',
      electronDist: '.tmp/electron-mas-arm64',
      folioleCliPath: '.tmp/Foliole CLI.app',
      globalCaptureHelperPath: '.tmp/Foliole Global Capture',
      notarize: false,
      outputDirectory: '/private/tmp/foliole-github-output',
      provisioningProfile: '/profiles/foliole-developer-id.provisionprofile'
    });

    expect(config.electronDist).toBe('.tmp/electron-mas-arm64');
    expect(config.extraMetadata.folioleBuildChannel).toBe('github');
    expect(config.directories.output).toBe('/private/tmp/foliole-github-output');
    expect(config.mac).toMatchObject({
      artifactName: '${productName}-macOS-${arch}-${version}.${ext}',
      binaries: ['Contents/MacOS/codex', 'Contents/MacOS/Foliole Global Capture'],
      entitlements: 'build/entitlements.mas.plist',
      entitlementsInherit: 'build/entitlements.mas.inherit.plist',
      extendInfo: { ElectronTeamID: 'V589TQH334' },
      forceCodeSigning: true,
      hardenedRuntime: true,
      identity: 'CAMPFIRIUM LTD (V589TQH334)',
      notarize: false,
      preAutoEntitlements: true,
      provisioningProfile: '/profiles/foliole-developer-id.provisionprofile',
      signIgnore: ['Contents/Helpers/Foliole CLI\\.app(?:/|$)'],
      target: ['dmg', 'zip']
    });
    expect(config.extraFiles).toContainEqual({
      from: '.tmp/Foliole CLI.app', to: 'Helpers/Foliole CLI.app'
    });
    expect(config.extraFiles).toContainEqual({
      from: '.tmp/Foliole Global Capture', to: 'MacOS/Foliole Global Capture'
    });
  });

  it('requires an explicit Developer ID sandbox provisioning profile', () => {
    expect(() => resolveDeveloperIdProvisioningProfile({})).toThrow(
      'FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE'
    );
    expect(resolveDeveloperIdProvisioningProfile({
      FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE: './profile.provisionprofile'
    })).toBe(path.resolve('./profile.provisionprofile'));
  });

  it('requires a distinct Developer ID profile for the bundled CLI', () => {
    expect(() => resolveDeveloperIdCliProvisioningProfile({})).toThrow(
      'FOLIOLE_MACOS_CLI_DEVELOPER_ID_PROVISIONING_PROFILE'
    );
    expect(resolveDeveloperIdCliProvisioningProfile({
      FOLIOLE_MACOS_CLI_DEVELOPER_ID_PROVISIONING_PROFILE: './cli.provisionprofile'
    })).toBe(path.resolve('./cli.provisionprofile'));
  });

  it('requires a complete supported notarization credential set', () => {
    expect(hasNotarizationCredentials({ APPLE_ID: 'set', APPLE_TEAM_ID: 'set' })).toBe(false);
    expect(hasNotarizationCredentials({
      APPLE_APP_SPECIFIC_PASSWORD: 'set', APPLE_ID: 'set', APPLE_TEAM_ID: 'set'
    })).toBe(true);
    expect(hasNotarizationCredentials({
      APPLE_API_ISSUER: 'set', APPLE_API_KEY: 'set', APPLE_API_KEY_ID: 'set'
    })).toBe(true);
    expect(hasNotarizationCredentials({ APPLE_KEYCHAIN_PROFILE: 'Foliole-Notary-2026' })).toBe(true);
  });

  it('writes a checksum for the only DMG artifact', async () => {
    const directory = await makeTemporaryDirectory('foliole-macos-package-');
    await writeFile(path.join(directory, 'Foliole.dmg'), 'signed image');

    const result = await writeDmgChecksum(directory, 'Foliole.dmg');

    expect(result.name).toBe('Foliole.dmg');
    expect(await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
      .toBe(`${result.digest}  Foliole.dmg\n`);
  });

  it('derives exact formal artifact names and rejects a non-DMG checksum target', async () => {
    expect(createGithubArtifactNames('Foliole', '0.6.5')).toEqual([
      'Foliole-macOS-arm64-0.6.5.dmg',
      'Foliole-macOS-arm64-0.6.5.dmg.blockmap',
      'Foliole-macOS-arm64-0.6.5.zip',
      'Foliole-macOS-arm64-0.6.5.zip.blockmap',
      'latest-mac.yml',
      'SHA256SUMS.txt'
    ]);
    await expect(writeDmgChecksum('/unused', 'Foliole.zip')).rejects.toThrow('exact DMG artifact name');
  });

});
