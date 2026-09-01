import { spawnSync } from 'node:child_process';

const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

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

export function readLatestElectronEligibilityInput({ now, runGh, runNpm = runNpmJson }) {
  const release = runGh(['api', 'repos/electron/electron/releases/latest']);
  const npmMetadata = readNpmPackageMetadata('electron', runNpm);
  return {
    githubRelease: {
      isDraft: release?.draft,
      isPrerelease: release?.prerelease,
      tagName: release?.tag_name
    },
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
