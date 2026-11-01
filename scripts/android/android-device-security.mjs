import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { digest } from '../security/security-inputs.mjs';

export function recordAndroidDeviceSecurity({ assertFixed, captured, paths, serial, now = Date.now() }) {
  assertFixed(paths);
  const shell = args => captured(paths.adb, ['-s', serial, 'shell', ...args]);
  const property = name => shell(['getprop', name]);
  const webview = shell(['dumpsys', 'webviewupdate']);
  const provider = /Current WebView package \(name, version\):\s*\(([^,]+),\s*([^)]+)\)/u.exec(webview);
  const result = { schemaVersion: 1, checkedAt: new Date(now).toISOString(),
    manufacturer: property('ro.product.manufacturer'), model: property('ro.product.model'),
    release: property('ro.build.version.release'), sdk: property('ro.build.version.sdk'),
    patch: property('ro.build.version.security_patch'),
    webview: provider ? { package: provider[1].trim(), version: provider[2].trim() } : { status: 'unknown' },
    providerDumpSha256: digest(webview), owner: 'OEM owns OS patches; device administrator owns WebView updates; Foliole owns compatibility and disclosure' };
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result.patch) || !result.release || !result.sdk) throw new Error('Device security identity is incomplete');
  const file = path.join(paths.sourceRepoRoot, '.lab/internal/security-maintenance/android-device.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function readAndroidDeviceSecurity(root) {
  try { return JSON.parse(readFileSync(path.join(root, '.lab/internal/security-maintenance/android-device.json'), 'utf8')); }
  catch { return { status: 'unknown', reason: 'fixed-device-observation-unavailable-in-this-environment' }; }
}

export async function collectAndroidDeviceNotices(device, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const sources = { os: 'https://source.android.com/docs/security/bulletin/asb-overview',
    webview: 'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Webview&num=1' };
  const row = { asset: 'android-os-webview', route: 'vendor-notices', checkedAt: new Date(now).toISOString(),
    source: Object.values(sources).join(' '), findings: [], evidence: { versions: device, sources: Object.values(sources) } };
  try {
    const get = async url => {
      const response = await fetchImpl(url, { signal: globalThis.AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Device advisory source HTTP ${response.status}`);
      return response.text();
    };
    const bulletin = await get(sources.os);
    const dates = [...bulletin.matchAll(/href="\/docs\/security\/bulletin\/\d{4}\/(\d{4}-\d{2}-\d{2})"/gu)]
      .map(match => match[1]).sort();
    if (!dates.length) throw new Error('Official Android bulletin index has no parsed records');
    const releases = JSON.parse(await get(sources.webview));
    if (!Array.isArray(releases) || !releases.length || releases[0].platform !== 'Webview'
      || !/^\d+\.\d+\.\d+\.\d+$/u.test(releases[0].version)) throw new Error('No parsed official WebView release');
    const latest = dates.at(-1);
    row.evidence.latestBulletin = latest;
    row.evidence.latestWebview = releases[0].version;
    row.evidence.bulletinDigest = digest(bulletin);
    const fresh = now - Date.parse(device.checkedAt) >= 0 && now - Date.parse(device.checkedAt) <= 192 * 3_600_000;
    const assessment = `Latest Android bulletin ${latest}; latest stable WebView ${releases[0].version}. OEM/device administrator must assess applicability and update availability. Older supported reader compatibility is not a security-support guarantee.`;
    row.findings.push({ platform: 'android', package: 'android-os-webview',
      versions: [device.patch ?? 'unknown', device.webview?.version ?? 'unknown'],
      advisory: `device-review-${latest}-${releases[0].version}`, severity: 'info', source: sources.os, assessment });
    row.status = fresh ? 'findings' : 'unsupported';
    row.reason = fresh ? 'vendor-bulletin-and-release-require-device-owner-assessment' : 'device-inventory-unavailable-or-older-than-eight-days';
  } catch (error) { row.status = 'error'; row.reason = error.message; }
  return row;
}
