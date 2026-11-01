// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { jdkNotices, sdkNotices } from './android-toolchain-notices.mjs';
import { collectAndroidDeviceNotices, recordAndroidDeviceSecurity } from './android-device-security.mjs';
import { inspectAndroidNativeComponents } from './android-native-components.mjs';
import { securityArtifactFixture } from '../security/security-artifact-fixture.mjs';
import { digest } from '../security/security-inputs.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function directory() {
  const base = path.resolve('.tmp/artifacts/T674-2/toolchain-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-')); roots.push(root); return root;
}
const response = body => new globalThis.Response(typeof body === 'string' ? body : JSON.stringify(body));
const java = { version: '21.0.11', vendor: 'Homebrew', trustStore: {
  certificates: ['fingerprint'], subjects: ['CN=Compromised Root,O=Example'] } };
const certs = 'String[] ROOTS = {"Compromised Root", "Root Two", "Root Three", "Root Four"};';

it('checks the selected JDK distributor and actual compromised roots without executing downloaded code', async () => {
  const fetchImpl = async url => response(url.includes('CheckCerts') ? certs : { versions: { stable: '21.0.13.0.3' } });
  const result = await jdkNotices(java, fetchImpl);
  expect(result.findings).toHaveLength(2);
  expect(result.findings.some(row => row.assessment.includes('Actual selected trust store'))).toBe(true);
  expect((await jdkNotices({ ...java, version: '21.0.13.0.3', trustStore: { certificates: ['a'], subjects: ['CN=Trusted'] } }, fetchImpl)).findings).toEqual([]);
  await expect(jdkNotices({ ...java, vendor: 'Unknown' }, fetchImpl)).rejects.toThrow('Unsupported');
  await expect(jdkNotices(java, async () => response('layout changed'))).rejects.toThrow();
});

it('compares installed SDK revisions against parsed stable repository entries and rejects missing packages', async () => {
  const root = directory();
  const names = ['build-tools;35.0.0', 'platforms;android-36', 'platform-tools', 'cmdline-tools;latest'];
  for (const name of names) {
    const folder = path.join(root, ...name.split(';')); mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'source.properties'), 'Pkg.Revision=35.0.0\n');
  }
  const xml = `<repository>${names.map(name => `<remotePackage path="${name}"><channelRef ref="channel-0"/>
    <revision><major>36</major><minor>0</minor><micro>0</micro></revision></remotePackage>`).join('')}</repository>`;
  const hosts = [{ compileSdk: 'android-36', buildTools: '35.0.0', sdkDirectory: root }];
  const result = await sdkNotices(hosts, async () => response(xml));
  expect(result.findings).toHaveLength(4);
  expect(result.evidence.versions).toHaveLength(4);
  await expect(sdkNotices(hosts, async () => response('<repository/>'))).rejects.toThrow('No parsed');
});

it('identifies components in actual ZIP members and rejects changed artifacts', () => {
  const root = directory(), file = path.join(root, 'library.aar');
  const bytes = securityArtifactFixture({ 'jni/arm64-v8a/libsqlcipher.so': ['', 'libtomcrypt', '4.20.0', '3.54.1', '1.18.2', ''].join('\0') });
  writeFileSync(file, bytes);
  const inventory = { configurations: [{ nativeArtifacts: [{ file, sha256: digest(bytes), version: '4.20.0' }] }] };
  const [result] = inspectAndroidNativeComponents(inventory);
  expect(result.libraries[0]).toMatchObject({ sqlcipher: '4.20.0', sqlite: '3.54.1', provider: 'LibTomCrypt', crypto: '1.18.2' });
  writeFileSync(file, 'changed');
  expect(() => inspectAndroidNativeComponents(inventory)).toThrow('changed');
});

it('records only fixed read-only device facts and never labels missing or stale inventory as clean', async () => {
  const root = directory(), calls = [];
  const captured = (_command, args) => {
    calls.push(args);
    return args.includes('dumpsys') ? 'Current WebView package (name, version): (com.google.android.webview, 108.0.5359.128)'
      : args.includes('ro.build.version.security_patch') ? '2023-11-01' : '13';
  };
  const device = recordAndroidDeviceSecurity({ paths: { sourceRepoRoot: root, adb: 'fixed-adb' }, serial: 'fixed-device',
    captured, assertFixed: () => {}, now: Date.now() });
  expect(calls.every(args => args[0] === '-s' && args[1] === 'fixed-device' && ['getprop', 'dumpsys'].includes(args[3]))).toBe(true);
  const fetchImpl = async url => response(url.includes('chromiumdash') ? [{ platform: 'Webview', version: '157.0.8103.30' }]
    : '<a href="/docs/security/bulletin/2026/2026-10-01">Bulletin</a>');
  expect((await collectAndroidDeviceNotices(device, { fetchImpl })).status).toBe('findings');
  expect((await collectAndroidDeviceNotices({}, { fetchImpl })).status).toBe('unsupported');
  expect((await collectAndroidDeviceNotices(device, { fetchImpl, now: Date.now() + 193 * 3_600_000 })).status).toBe('unsupported');
  expect((await collectAndroidDeviceNotices(device, { fetchImpl: async () => response([]) })).status).toBe('error');
});

it('keeps native upstream updates distinct from vulnerabilities and exposes source/identity failures', async () => {
  const { collectAndroidComponentNotices } = await import('./android-component-notices.mjs');
  const components = [{ libraries: [{ sqlcipher: '4.20.0', sqlite: '3.53.0', provider: 'LibTomCrypt', crypto: '1.18.1' }] }];
  const fetchImpl = async url => response(url.includes('sqlite.org') ? '<h3>2026-10-16 (3.54.1)</h3>'
    : [{ tag_name: 'v1.18.2', draft: false, prerelease: false }]);
  const result = await collectAndroidComponentNotices(components, { fetchImpl });
  expect(result.status).toBe('findings');
  expect(result.findings.map(row => row.package)).toEqual(['sqlite', 'libtomcrypt']);
  expect(result.findings.every(row => row.severity === 'info' && row.assessment.includes('not itself a vulnerability'))).toBe(true);
  expect((await collectAndroidComponentNotices([], { fetchImpl })).status).toBe('error');
  expect((await collectAndroidComponentNotices(components, { fetchImpl: async () => response('changed') })).status).toBe('error');
});
