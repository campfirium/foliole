import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createGithubBuilderConfig,
  hasNotarizationCredentials,
  prepareMasElectronDist,
  resolveDeveloperIdProvisioningProfile,
  sendMacosNotification,
  writeDmgChecksum
} from './package-github.mjs';

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
      notarize: false,
      provisioningProfile: '/profiles/foliole-developer-id.provisionprofile'
    });

    expect(config.electronDist).toBe('.tmp/electron-mas-arm64');
    expect(config.directories.output).toBe('artifacts/macos/github-arm64');
    expect(config.mac).toMatchObject({
      binaries: ['Contents/MacOS/codex'],
      entitlements: 'build/entitlements.mas.plist',
      entitlementsInherit: 'build/entitlements.mas.inherit.plist',
      extendInfo: { ElectronTeamID: 'V589TQH334' },
      forceCodeSigning: true,
      hardenedRuntime: true,
      identity: 'CAMPFIRIUM LTD (V589TQH334)',
      notarize: false,
      preAutoEntitlements: true,
      provisioningProfile: '/profiles/foliole-developer-id.provisionprofile',
      target: ['dmg', 'zip']
    });
  });

  it('prepares the MAS Electron runtime required by Apple App Sandbox', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'foliole-mas-electron-'));
    const calls = [];

    const result = await prepareMasElectronDist({
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
      destination: directory,
      download: async (details) => {
        calls.push(['download', details]);
        return '/cache/electron-mas.zip';
      },
      extract: async (source, target) => calls.push(['extract', source, target])
    });

    expect(result).toBe(directory);
    expect(calls).toEqual([
      ['download', expect.objectContaining({ arch: 'arm64', artifactName: 'electron', platform: 'mas' })],
      ['extract', '/cache/electron-mas.zip', directory]
    ]);
  });

  it('requires an explicit Developer ID sandbox provisioning profile', () => {
    expect(() => resolveDeveloperIdProvisioningProfile({})).toThrow(
      'FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE'
    );
    expect(resolveDeveloperIdProvisioningProfile({
      FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE: './profile.provisionprofile'
    })).toBe(path.resolve('./profile.provisionprofile'));
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
    const directory = await mkdtemp(path.join(tmpdir(), 'foliole-macos-package-'));
    await writeFile(path.join(directory, 'Foliole.dmg'), 'signed image');

    const result = await writeDmgChecksum(directory);

    expect(result.name).toBe('Foliole.dmg');
    expect(await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
      .toBe(`${result.digest}  Foliole.dmg\n`);
  });

  it('sends a local macOS notification without exposing release credentials', () => {
    const calls = [];
    const sent = sendMacosNotification('Foliole macOS release', 'Apple notarization completed.', (...args) => {
      calls.push(args);
      return { status: 0 };
    });

    expect(sent).toBe(true);
    expect(calls).toEqual([[
      'osascript',
      expect.arrayContaining(['Foliole macOS release', 'Apple notarization completed.']),
      { stdio: 'ignore' }
    ]]);
  });
});
