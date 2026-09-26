import { expect, it } from 'vitest';

import { createSourceBuilderConfig } from './macos.mjs';

it('packages all macOS helpers under an isolated source identity', () => {
  const config = createSourceBuilderConfig({
    appId: 'com.campfirium.foliole',
    directories: { output: 'artifacts/windows' },
    extraFiles: [{ from: 'build/cli', to: 'bin' }],
    mac: { target: ['dmg'] },
    publish: [{ provider: 'github' }]
  }, { codex: '/tmp/codex', capture: '/tmp/capture', cli: '/tmp/cli.app' });

  expect(config.appId).toBe('org.foliole.source');
  expect(config.afterPack).toBe('scripts/build/macos-after-pack.mjs');
  expect(config.extraMetadata.folioleBuildChannel).toBe('source');
  expect(config.publish).toBeNull();
  expect(config.mac.identity).toBe('-');
  expect(config.mac.entitlements).toBe('build/entitlements.mac.source.plist');
  expect(config.mac.extendInfo).toMatchObject({ CFBundleName: 'Foliole Source', CFBundleDisplayName: 'Foliole' });
  expect(config.extraFiles).toEqual([
    { from: '/tmp/codex', to: 'MacOS/codex' },
    { from: '/tmp/capture', to: 'MacOS/Foliole Global Capture' },
    { from: '/tmp/cli.app', to: 'Helpers/Foliole CLI.app' }
  ]);
});
