// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { dispatchMacosA5Action } from './macos-a5-action-dispatch.mjs';
import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { prepareFormalA5ReceiptCompletion } from './macos-a5-formal-receipt.mjs';
import { releaseBundleInputs } from './macos-a5-release-bundle.mjs';

const roots = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-bundle-'));
  roots.push(root);
  const write = (name, contents) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  write('package.json', '{"version":"0.7.14"}');
  write('dist/companion/index.html', '<html>current</html>');
  write('android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
    '<manifest package="com.foliole.android" android:versionCode="17" android:versionName="0.7.14"/>');
  const paths = { buildRoot: root, sourceRepoRoot: root, artifactsRoot: path.join(root, 'evidence'),
    runId: 'run', cap: '/cap', gradle: '/gradle' };
  const checked = vi.fn((command) => {
    if (command === paths.gradle) write('android/app/build/outputs/bundle/release/app-release.aab', 'unsigned');
  });
  const captured = vi.fn((command, args) => {
    if (command === 'git') return args[0] === 'rev-parse' ? 'a'.repeat(40) : '';
    if (args[0] === '-Z1') return ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml',
      'base/dex/classes.dex', 'base/assets/public/index.html'].join('\n');
    return args[2].endsWith('index.html') ? '<html>current</html>' : '{"appId":"com.foliole.android"}';
  });
  return { paths, checked, captured, write, action: 'bundle-release',
    env: { FOLIOLE_ANDROID_VERSION_CODE: '17' }, assertFixed: vi.fn() };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('builds and retains an unsigned release AAB through the fixed entry without touching a device', async () => {
  const args = fixture();
  await dispatchMacosA5Action(args);
  expect(args.checked.mock.calls.map(([command]) => command)).toEqual(['npm', '/cap', '/gradle']);
  expect(args.checked.mock.calls[2][1]).toContain(':app:bundleRelease');
  expect(args.checked.mock.calls[2][1]).toContain('-PfolioleVersionCode=17');
  expect(args.assertFixed).not.toHaveBeenCalled();
  const directory = path.join(args.paths.artifactsRoot, 'android-release-bundle/run');
  expect(fs.readFileSync(path.join(directory, 'app-release-unsigned.aab'), 'utf8')).toBe('unsigned');
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'bundle.json')))).toMatchObject({
    signing: 'unsigned', productAcceptance: false, identity: { versionCode: 17, versionName: '0.7.14' }
  });
  expect(assertRegisteredMacosA5Action('bundle-release')).toMatchObject({
    deviceLeaseMode: null, mutatesFixedA5: false, requiresHiddenDesktopRuntime: false
  });
});

it.each([undefined, '0', '-1', '1.5', '2e3', '2100000001'])('rejects invalid build code %s before building', (code) => {
  const args = fixture();
  expect(() => releaseBundleInputs({ FOLIOLE_ANDROID_VERSION_CODE: code }, args.paths.buildRoot))
    .toThrow('VERSION_CODE');
});

it.each(['FOLIOLE_ANDROID_DEV_LIVE_RELOAD', 'FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID',
  'FOLIOLE_DATABASE_PERFORMANCE_SCENARIO', 'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE'])(
  'rejects %s before producing a release bundle', async (key) => {
  const args = fixture(); args.env[key] = '1';
  await expect(dispatchMacosA5Action(args)).rejects.toThrow('overrides');
  expect(args.checked).not.toHaveBeenCalled();
  });

it('does not retain a stale bundle when Gradle produces no output', async () => {
  const args = fixture();
  args.write('android/app/build/outputs/bundle/release/app-release.aab', 'stale');
  args.checked = vi.fn();
  await expect(dispatchMacosA5Action(args)).rejects.toThrow('not produced');
  expect(fs.existsSync(path.join(args.paths.artifactsRoot, 'android-release-bundle'))).toBe(false);
});

it('rejects live server assets and mismatched native versions', async () => {
  const args = fixture();
  const original = args.captured;
  args.captured = (command, argv) => argv[2]?.endsWith('capacitor.config.json')
    ? '{"appId":"com.foliole.android","server":{"url":"http://localhost:1234"}}'
    : original(command, argv);
  await expect(dispatchMacosA5Action(args)).rejects.toThrow('live server');
  args.captured = original;
  args.env.FOLIOLE_ANDROID_VERSION_CODE = '18';
  await expect(dispatchMacosA5Action(args)).rejects.toThrow('merged manifest');
});

it('completes bundle provenance without requiring or relabeling a debug APK', async () => {
  const args = fixture(); await dispatchMacosA5Action(args);
  const context = { ...args.paths, action: 'bundle-release', formalSourceClass: 'frozen-build',
    sourceArchiveDigest: 'c'.repeat(64) };
  const manager = { actionContract: assertRegisteredMacosA5Action('bundle-release'), fsApi: fs,
    now: () => 'now', path: path.join(args.paths.artifactsRoot, 'formal.json'),
    receipt: { resultStatus: 'pending', apk: null, source: {} } };
  prepareFormalA5ReceiptCompletion(manager, context, { apk: '/missing' });
  expect(manager.receipt.apk).toBeNull();
  expect(manager.receipt.bundle.digest).toMatch(/^[a-f0-9]{64}$/u);
  expect(manager.receipt.source.archiveDigest).toBe(context.sourceArchiveDigest);
});
