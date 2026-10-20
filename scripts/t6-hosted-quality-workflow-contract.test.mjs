// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file) => fs.readFileSync(file, 'utf8');
const hostedBucketRunner = read('scripts/quality/hosted-quality-bucket.mjs');
const sources = {
  android: read('.github/workflows/hosted-quality-android.yml'),
  androidHost: read('.github/workflows/hosted-quality-android-host.yml'),
  androidWebBuild: read('.github/workflows/hosted-quality-android-web-build.yml'),
  core: read('.github/workflows/hosted-quality-core.yml'),
  dependencyHardening: read('.github/workflows/hosted-quality-dependency-hardening.yml'),
  desktopBuild: read('.github/workflows/hosted-quality-desktop-build.yml'),
  desktopStatic: read('.github/workflows/hosted-quality-desktop-static.yml'),
  desktopSource: read('.github/workflows/hosted-quality-desktop-source.yml'),
  electron: read('.github/workflows/hosted-quality-electron.yml'),
  ios: read('.github/workflows/hosted-quality-ios.yml'),
  portableDomain: read('.github/workflows/hosted-quality-portable-domain.yml'),
  remote: read('.github/workflows/remote-quality.yml'),
  scopedStatic: read('.github/workflows/hosted-quality-scoped-static.yml'),
  shared: read('.github/workflows/hosted-quality-shared.yml'),
  static: read('.github/workflows/hosted-quality-static.yml'),
  t6: read('.github/workflows/t6-hosted-quality.yml'),
  tooling: read('.github/workflows/hosted-quality-tooling.yml'),
  windowsAcceptance: read('.github/workflows/hosted-quality-windows-acceptance.yml'),
  windowsCore: read('.github/workflows/hosted-quality-windows-core.yml')
};
const workflows = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => [name, parse(source)])
);

describe('Hosted leaf command coverage', () => {
  it('preserves the complete heavy host and command union', () => {
    expect(Object.keys(workflows.core.jobs)).toEqual([
      'shared-quality', 'desktop-static', 'desktop-source-tests', 'desktop-shared-tests',
      'desktop-electron-tests', 'desktop-tooling-tests', 'desktop-windows-core',
      'desktop-dependency-hardening', 'desktop-build', 'linux-package-acceptance',
      'desktop-admission', 'android-quality', 'ios-quality'
    ]);
    expect(workflows.ios.jobs.contract.env.FOLIOLE_IOS_RESOURCE_MODE).toBe('full');
    const portableMatrix = workflows.portableDomain.jobs['portable-domain-tests'].strategy.matrix.include;
    expect(portableMatrix).toBe(
      "${{ fromJSON(inputs.domain == 'android-source' && '[{\"host\":\"Ubuntu\",\"runner\":\"ubuntu-latest\"}]'"
      + " || '[{\"host\":\"Ubuntu\",\"runner\":\"ubuntu-latest\"},{\"host\":\"Windows\",\"runner\":\"windows-latest\"}]') }}"
    );
    expect(workflows.portableDomain.jobs['portable-domain-tests'].strategy['fail-fast']).toBe(false);
    const electronMatrix = workflows.electron.jobs['electron-tests'].strategy.matrix.include;
    const expectedElectronEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['database', 'import', 'ipc', 'services'].map((shard) => `${host}:${shard}`)
    )).sort();
    const actualElectronEntries = electronMatrix.flatMap(({ host, shards }) => (
      shards.map((shard) => `${host}:${shard}`)
    )).sort();
    expect(actualElectronEntries).toEqual(expectedElectronEntries);
    expect(new Set(actualElectronEntries).size).toBe(actualElectronEntries.length);
    expect(workflows.electron.jobs['electron-tests'].strategy['fail-fast']).toBe(false);
    expect(electronMatrix).toHaveLength(4);
    const desktopSourceMatrix = workflows.desktopSource.jobs['desktop-source-tests'].strategy.matrix.include;
    const expectedDesktopSourceEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['one', 'two', 'three', 'four'].map((shard) => `${host}:${shard}`)
    ));
    const actualDesktopSourceEntries = desktopSourceMatrix.flatMap(({ host, shards }) => (
      shards.map((shard) => `${host}:${shard}`)
    ));
    expect(actualDesktopSourceEntries)
      .toEqual(expectedDesktopSourceEntries);
    expect(new Set(actualDesktopSourceEntries).size).toBe(8);
    expect(desktopSourceMatrix).toHaveLength(3);
    expect(desktopSourceMatrix.filter(({ host }) => host === 'Windows').map(({ shards }) => shards))
      .toEqual([['one', 'two'], ['three', 'four']]);
    expect(sources.portableDomain).not.toContain('paths:');
    expect(sources.portableDomain).not.toContain('paths-ignore:');
    expect(sources.portableDomain).not.toContain('changed-files');
    const hostSources = {
      Ubuntu: `${sources.static}\n${sources.scopedStatic}\n${sources.desktopStatic}\n${sources.dependencyHardening}\n${sources.portableDomain}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${hostedBucketRunner}\n${sources.desktopBuild}\n${sources.androidWebBuild}\n${sources.androidHost}`,
      Windows: `${sources.windowsCore}\n${sources.portableDomain}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${hostedBucketRunner}\n${sources.windowsAcceptance}`,
      macOS: sources.ios
    };
    const commands = {
      Ubuntu: [
        'release-static', 'test:release:desktop-src', 'test:release:android',
        'test:release:shared', 'test:desktop:electron', 'quality:release:tooling',
        'quality-gate-target.sh desktop-static', 'deps:hardening:check',
        'npm run build', 'electron:compile', 'android:web:build',
        'check-workspace-settings-boundary.mjs', 'quality:release:android:tail'
      ],
      Windows: [
        'test:release:desktop-src', 'test:release:shared',
        'test:desktop:electron', 'quality:release:tooling', 'quality:release:windows:core',
        'build:vite-only', 'electron:compile', 'quality:release:windows:tail',
        'windows-ci-playwright-profile.mjs'
      ],
      macOS: ['ios:sync:preflight', 'quality:ios:contract', 'ios-hosted-acceptance-bucket.mjs']
    };
    for (const [host, expected] of Object.entries(commands)) {
      for (const command of expected) expect(hostSources[host]).toContain(command);
    }
  });

});
