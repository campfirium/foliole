// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { checkSyncBreakingMark } from './release-doctor.mjs';
import { validateReleaseManifestPublication } from './prepare-release-manifest-site.mjs';
import {
  assertSyncBreakingMarked,
  parseSyncProtocolVersion,
  readSyncProtocolAtTag
} from './release-sync-protocol-contract.mjs';

const source = (version) => `export const CURRENT_SYNC_PROTOCOL_DESCRIPTOR = Object.freeze({
  capabilities: Object.freeze(['a']),
  max_supported_version: ${version},
  min_supported_version: ${version},
  version: ${version}
} as const satisfies SyncProtocolDescriptor);
export type SyncProtocolDescriptor = {
  version: number;
};
`;

describe('release sync protocol contract', () => {
  it('reads the current descriptor version, not the type declaration', () => {
    expect(parseSyncProtocolVersion(source(39))).toBe(39);
    expect(() => parseSyncProtocolVersion('export const x = 1;')).toThrow(/must declare/u);
  });

  it('requires syncBreaking only when the protocol number changes', () => {
    const base = { previousVersion: '0.8.2', version: '0.8.3' };
    expect(assertSyncBreakingMarked({ ...base, currentProtocol: 36, previousProtocol: 36, entry: {} })).toEqual({ changed: false });
    expect(() => assertSyncBreakingMarked({ ...base, currentProtocol: 39, previousProtocol: 36, entry: {} }))
      .toThrow(/36 \(v0\.8\.2\) to 39 \(v0\.8\.3\).*"syncBreaking": true/u);
    expect(() => assertSyncBreakingMarked({ ...base, currentProtocol: 39, previousProtocol: 36, entry: { syncBreaking: 'yes' } }))
      .toThrow(/syncBreaking/u);
    expect(assertSyncBreakingMarked({ ...base, currentProtocol: 39, previousProtocol: 36, entry: { syncBreaking: true } }))
      .toEqual({ changed: true });
  });

  it('reads a tag and fetches it once when it is not local', () => {
    const run = vi.fn()
      .mockImplementationOnce(() => { throw new Error('unknown revision'); })
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => source(36));
    expect(readSyncProtocolAtTag('v0.8.2', { run })).toBe(36);
    expect(run.mock.calls[1][1]).toEqual(['fetch', '--depth=1', 'origin', 'refs/tags/v0.8.2:refs/tags/v0.8.2']);
  });

  it('doctor checks the newest entry against the one below it', () => {
    const manifest = { releases: [{ version: '0.8.3' }, { version: '0.8.2' }] };
    const read = (tag) => (tag === 'v0.8.3' ? 39 : 36);
    expect(checkSyncBreakingMark(manifest, '0.8.3', read)).toMatchObject({ status: 'FAIL' });
    manifest.releases[0].syncBreaking = true;
    expect(checkSyncBreakingMark(manifest, '0.8.3', read)).toMatchObject({ status: 'PASS' });
  });

  it('Pages preparation fails an unmarked protocol change and allows the marked entry', () => {
    const repository = 'campfirium/foliole';
    const version = '0.9.0';
    const registry = {
      schemaVersion: 1,
      platforms: [{
        id: 'windows', displayName: 'Windows', status: 'active', architectures: ['x64'],
        deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
        downloadAsset: 'Foliole-Windows-x64-{version}.exe', managedAssets: ['Foliole-Windows-x64-{version}.exe'],
        update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
      }]
    };
    const intent = { schemaVersion: 1, version, publicationMode: 'bridge', selectedPlatforms: ['windows'], scopeBasis: { windows: 'x' } };
    const entry = (extra) => ({ platforms: ['windows'], url: `https://github.com/${repository}/releases/tag/v${version}`, version, ...extra });
    const manifest = (extra) => ({
      desktopUpdater: { compatibilityBridgeVersion: version, firstCapableVersion: version, manualUpgradeFrom: '0.7.0', verifiedBaselineVersion: version },
      latest: version,
      releases: [entry(extra)]
    });
    const run = (current, previousManifest) => validateReleaseManifestPublication({
      enNotes: { [version]: { notes: ['A', 'a.'] } }, intent, manifest: current,
      previousManifest, readSyncProtocol: (tag) => (tag === `v${version}` ? 39 : 36),
      registry, release: { assets: [{ name: `Foliole-Windows-x64-${version}.exe` }], draft: false, published_at: '2026-07-31T00:00:00Z', tag_name: `v${version}` },
      repository, zhNotes: { [version]: { notes: ['甲', '乙。'] } }
    });
    const previousManifest = { ...manifest(), latest: '0.8.9', releases: [] };
    expect(() => run(manifest(), previousManifest)).toThrow(/syncBreaking/u);
    expect(run(manifest({ syncBreaking: true }), previousManifest)).toMatchObject({ version });
  });
});
