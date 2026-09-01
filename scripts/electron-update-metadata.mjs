import { spawnSync } from 'node:child_process';

const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function normalizeTag(tagName) {
  const version = typeof tagName === 'string' && tagName.startsWith('v') ? tagName.slice(1) : null;
  return STABLE_VERSION.test(version ?? '') ? version : null;
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function releaseIdentity(release) {
  return {
    isDraft: release?.draft,
    isPrerelease: release?.prerelease,
    tagName: release?.tag_name
  };
}

function parseJsonOutput(command, args, result) {
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  const source = result.stdout.trim();
  if (!source) throw new Error(`${command} ${args.join(' ')} returned empty JSON`);
  return JSON.parse(source);
}

export function runNpmJson(args, options = {}) {
  const runner = options.runner ?? spawnSync;
  const result = runner('npm', args, { encoding: 'utf8', timeout: options.timeoutMs ?? 120000 });
  return parseJsonOutput('npm', args, result);
}

export function readNpmPackageMetadata(packageName, runNpm = runNpmJson) {
  const metadata = runNpm(['view', packageName, 'dist-tags', 'time', '--json']);
  const latest = metadata?.['dist-tags']?.latest;
  return { latest, publishedAt: metadata?.time?.[latest], time: metadata?.time ?? {} };
}

function stableRefsForMajor(major, runGh) {
  const endpoint = `repos/electron/electron/git/matching-refs/tags/v${major}.?per_page=100`;
  const pages = runGh(['api', '--paginate', '--slurp', endpoint]);
  if (!Array.isArray(pages) || pages.length === 0 || pages.some((page) => !Array.isArray(page))) {
    throw new Error(`Electron v${major} stable tag collection is incomplete`);
  }
  return [...new Set(pages.flat().map((entry) => normalizeTag(entry?.ref?.replace('refs/tags/', '')))
    .filter((version) => version?.startsWith(`${major}.`)))];
}

function assertOfficialStableRelease(version, runGh) {
  const release = runGh(['api', `repos/electron/electron/releases/tags/v${version}`]);
  if (release?.draft !== false || release?.prerelease !== false || normalizeTag(release?.tag_name) !== version) {
    throw new Error(`Electron v${version} is not an official stable release`);
  }
  return releaseIdentity(release);
}

export function readElectronStableContext(version, runGh) {
  if (!STABLE_VERSION.test(version ?? '')) throw new Error('Electron stable context requires a stable version');
  const targetMajor = Number(version.split('.')[0]);
  const stableVersions = stableRefsForMajor(targetMajor, runGh);
  if (!stableVersions.includes(version)) throw new Error(`Electron v${version} is missing from official stable tags`);
  let previous = stableVersions.filter((candidate) => compareVersions(candidate, version) < 0)
    .sort((left, right) => compareVersions(right, left))[0];
  for (let major = targetMajor - 1; !previous && major >= 0; major -= 1) {
    const candidates = stableRefsForMajor(major, runGh);
    stableVersions.push(...candidates);
    previous = candidates.sort((left, right) => compareVersions(right, left))[0];
  }
  if (!previous) throw new Error(`Electron v${version} has no provable previous official stable release`);
  assertOfficialStableRelease(previous, runGh);
  return { officialStableVersions: stableVersions, previousVersion: previous, stableVersionsComplete: true };
}

export function readElectronVersionEligibilityInput({ now, runGh, runNpm = runNpmJson, version }) {
  const npmMetadata = readNpmPackageMetadata('electron', runNpm);
  const githubRelease = assertOfficialStableRelease(version, runGh);
  const context = readElectronStableContext(version, runGh);
  return {
    ...context,
    githubRelease,
    now,
    npmMetadata: { latest: npmMetadata.latest, publishedAt: npmMetadata.time?.[version] }
  };
}

export function readLatestElectronEligibilityInput({ now, runGh, runNpm = runNpmJson }) {
  const release = runGh(['api', 'repos/electron/electron/releases/latest']);
  const npmMetadata = readNpmPackageMetadata('electron', runNpm);
  const version = normalizeTag(release?.tag_name);
  if (!version) throw new Error('Electron latest release does not have a stable version tag');
  const context = readElectronStableContext(version, runGh);
  return {
    ...context,
    githubRelease: releaseIdentity(release),
    now,
    npmMetadata: { latest: npmMetadata.latest, publishedAt: npmMetadata.publishedAt }
  };
}

export function readVerifiedElectronSecurityAdvisory({ advisoryId, runGh, version }) {
  if (!/^GHSA-[a-z0-9-]+$/iu.test(advisoryId ?? '') || !STABLE_VERSION.test(version ?? '')) {
    throw new Error('security advisory requires a named GHSA id and stable Electron version');
  }
  const advisory = runGh(['api', `advisories/${advisoryId}`]);
  if (advisory?.ghsa_id !== advisoryId || advisory.withdrawn_at) {
    throw new Error(`security advisory ${advisoryId} is missing, mismatched, or withdrawn`);
  }
  const fixesElectron = (advisory.vulnerabilities ?? []).some((entry) => {
    const fixedVersion = entry?.first_patched_version;
    return entry?.package?.ecosystem === 'npm'
      && entry?.package?.name === 'electron'
      && fixedVersion === version;
  });
  if (!fixesElectron) throw new Error(`security advisory ${advisoryId} does not verify Electron ${version} as fixed`);
  return {
    fixedVersions: [version],
    id: advisoryId,
    packageName: 'electron',
    source: 'github-advisory-database',
    verified: true
  };
}
