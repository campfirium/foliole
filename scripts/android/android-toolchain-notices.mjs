import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { compareVersions } from './android-official-security.mjs';
import { digest } from '../security/security-inputs.mjs';

const require = createRequire(import.meta.url);
const { parseStringPromise } = createRequire(require.resolve('@capacitor/cli/package.json'))('xml2js');
export const ANDROID_TOOLCHAIN_SOURCES = {
  sdk: 'https://dl.google.com/android/repository/repository2-3.xml',
  brew: 'https://formulae.brew.sh/api/formula/openjdk@21.json',
  temurin: 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse',
  zulu: 'https://api.azul.com/metadata/v1/zulu/packages/?java_version=21&os=linux&arch=x86&hw_bitness=64&java_package_type=jdk&archive_type=tar.gz&javafx_bundled=false&crac_supported=false&release_status=ga&availability_types=CA&latest=true&page_size=100',
  certs: 'https://cr.openjdk.org/~mr/CheckCerts.java'
};
async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: globalThis.AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Official source HTTP ${response.status}: ${url}`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`Empty official source: ${url}`);
  return text;
}
const notice = (asset, version, advisory, source, assessment) => ({ platform: 'android', package: asset,
  versions: [version], advisory, source, severity: 'info', assessment });

export async function jdkNotices(java, fetchImpl) {
  if (!java?.version || !java.trustStore?.certificates?.length || !java.trustStore.subjects?.length) {
    throw new Error('Actual Java distribution and trust store were not established');
  }
  const azul = /Azul/iu.test(java.vendor);
  if (azul && (java.os !== 'Linux' || java.arch !== 'amd64')) throw new Error('Unsupported Azul JDK host');
  const source = java.vendor === 'Homebrew' ? ANDROID_TOOLCHAIN_SOURCES.brew
    : azul ? ANDROID_TOOLCHAIN_SOURCES.zulu
      : /Adoptium|Temurin/iu.test(java.vendor) ? ANDROID_TOOLCHAIN_SOURCES.temurin : null;
  if (!source) throw new Error(`Unsupported JDK distributor: ${java.vendor}`);
  const text = await fetchText(source, fetchImpl);
  const body = JSON.parse(text);
  const latest = java.vendor === 'Homebrew' ? body.versions?.stable : azul
    ? body.find(row => row.availability_type === 'CA' && row.latest && row.java_version?.[0] === 21
      && row.name?.endsWith('-linux_x64.tar.gz'))?.java_version.join('.') : body[0]?.version?.openjdk_version;
  if (!latest || !/^21\.\d+\.\d+/u.test(latest)) throw new Error('JDK metadata has no selected-line stable release');
  const roots = await fetchText(ANDROID_TOOLCHAIN_SOURCES.certs, fetchImpl);
  const names = [...(roots.match(/String\[\] ROOTS = \{([\s\S]*?)\};/u)?.[1] ?? '').matchAll(/"([^"\r\n]+)"/gu)].map(match => match[1]);
  if (names.length < 4) throw new Error('Official trust-store positive control is missing');
  const bad = names.filter(name => java.trustStore.subjects.some(subject => subject.includes(`CN=${name}`)));
  const findings = bad.map(name => notice('jdk', java.version, `distrusted-root-${digest(name).slice(0, 16)}`,
    'https://ops.java/emudhra/', `Actual selected trust store contains a root identified by the official checker: ${name}`));
  const currentPatch = java.version.match(/^\d+\.\d+\.\d+/u)?.[0];
  const latestPatch = latest.match(/^\d+\.\d+\.\d+/u)?.[0];
  if (compareVersions(currentPatch, latestPatch) < 0) findings.push(notice('jdk', java.version,
    `release-review-${latestPatch}`, source, `New distributor release ${latest}; review security and trust-store changes. An update is not itself a vulnerability.`));
  return { findings, evidence: { versions: java, latest, sources: [source, ANDROID_TOOLCHAIN_SOURCES.certs],
    responseDigests: [digest(text), digest(roots)], checkedRoots: names,
    limitation: 'Release freshness and published compromised-root control; not complete JDK CVE applicability.' } };
}

export async function sdkNotices(android, fetchImpl) {
  if (!android?.length) throw new Error('Selected Android SDK is missing');
  const text = await fetchText(ANDROID_TOOLCHAIN_SOURCES.sdk, fetchImpl);
  const body = await parseStringPromise(text);
  const packages = Object.values(body)[0]?.remotePackage;
  if (!Array.isArray(packages) || !packages.length) throw new Error('No parsed Android SDK package records');
  const stable = packages.filter(row => row.channelRef?.[0]?.$?.ref === 'channel-0' && !row.obsolete);
  const findings = [];
  const installed = [];
  for (const host of android) {
    for (const name of [`build-tools;${host.buildTools}`, `platforms;${host.compileSdk}`, 'platform-tools', 'cmdline-tools;latest']) {
      const file = path.join(host.sdkDirectory, ...name.split(';'), 'source.properties');
      const properties = readFileSync(file, 'utf8');
      const revision = /^Pkg.Revision\s*=\s*(.+)$/mu.exec(properties)?.[1]?.trim();
      if (!revision) throw new Error(`Installed SDK package has no revision: ${name}`);
      const family = name.startsWith('build-tools;') ? 'build-tools;' : name.startsWith('cmdline-tools;') ? 'cmdline-tools;' : name;
      const candidates = stable.filter(row => family.endsWith(';') ? row.$.path.startsWith(family) : row.$.path === family);
      if (!candidates.length) throw new Error(`Selected SDK package is absent from official repository: ${name}`);
      const revisions = candidates.map(row => {
        const rev = row.revision?.[0];
        return [rev?.major?.[0], rev?.minor?.[0] ?? 0, rev?.micro?.[0] ?? 0].join('.');
      }).sort(compareVersions);
      const latest = revisions.at(-1);
      installed.push({ name, revision, latest, propertiesSha256: digest(properties) });
      const normalised = revision.split('.').concat(['0', '0']).slice(0, 3).join('.');
      if (compareVersions(normalised, latest) < 0) findings.push(notice('android-sdk', revision,
        `release-review-${family.replace(/[^a-z-]/gu, '')}-${latest}`, ANDROID_TOOLCHAIN_SOURCES.sdk,
        `Installed ${name} is ${revision}; newest stable repository revision is ${latest}. Review compatibility and security impact; this is not a vulnerability verdict.`));
    }
  }
  return { findings, evidence: { versions: installed, sources: [ANDROID_TOOLCHAIN_SOURCES.sdk], responseDigests: [digest(text)] } };
}

export async function collectAndroidToolchainNotices(inventory, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  return Promise.all([['jdk', () => jdkNotices(inventory.java, fetchImpl)],
    ['android-tools', () => sdkNotices(inventory.android, fetchImpl)]].map(async ([asset, collect]) => {
    const row = { asset, route: 'vendor-notices', source: Object.values(ANDROID_TOOLCHAIN_SOURCES).join(' '),
      checkedAt: new Date(now).toISOString(), findings: [] };
    try { const result = await collect(); Object.assign(row, result, { status: result.findings.length ? 'findings' : 'clean' }); }
    catch (error) { row.status = 'error'; row.reason = error.message; }
    return row;
  }));
}
