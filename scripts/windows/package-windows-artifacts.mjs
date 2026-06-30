import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

function directorySizeBytes(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(childPath);
    } else if (entry.isFile()) {
      total += statSync(childPath).size;
    }
  }
  return total;
}

export function formatBytes(bytes) {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function readPackageVersion(rootDir) {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  return packageJson.version;
}

export function resolveInstallerBaseName(packageVersion) {
  return `Foliole Setup ${packageVersion}`;
}

function isInstallerArtifact(fileName, packageVersion) {
  return fileName.endsWith('.exe') && fileName.includes('Foliole') && fileName.includes('Setup') && fileName.includes(packageVersion);
}

export function collectInstallerArtifactPaths(rootDir, packageVersion, outputDir = 'artifacts/windows') {
  const releaseDir = resolve(rootDir, outputDir);
  if (!existsSync(releaseDir)) return [];
  return readdirSync(releaseDir)
    .filter((fileName) => isInstallerArtifact(fileName, packageVersion))
    .sort()
    .map((fileName) => resolve(releaseDir, fileName));
}

export function resolvePackagedInstallerPath(rootDir, packageVersion, outputDir = 'artifacts/windows') {
  const candidates = collectInstallerArtifactPaths(rootDir, packageVersion, outputDir);
  if (candidates.length === 0) throw new Error(`No Foliole Windows installer found for version ${packageVersion}`);
  return candidates
    .map((candidate) => ({ path: candidate, mtimeMs: statSync(candidate).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0].path;
}

export function resolveReleaseArtifactPaths(rootDir, packageVersion) {
  const installerBaseName = resolveInstallerBaseName(packageVersion);
  const installerArtifacts = collectInstallerArtifactPaths(rootDir, packageVersion);
  const installerBlockmaps = installerArtifacts.map((artifactPath) => `${artifactPath}.blockmap`);
  return [
    resolve(rootDir, 'artifacts/windows/win-unpacked'),
    resolve(rootDir, 'artifacts/windows/win-unpacked.tmp'),
    resolve(rootDir, `artifacts/windows/${installerBaseName}.exe`),
    resolve(rootDir, `artifacts/windows/${installerBaseName}.exe.blockmap`),
    ...installerArtifacts,
    ...installerBlockmaps,
    resolve(rootDir, 'artifacts/windows/latest.yml'),
    resolve(rootDir, 'artifacts/windows/builder-debug.yml')
  ];
}

export function cleanReleaseArtifacts(rootDir, packageVersion) {
  for (const artifactPath of resolveReleaseArtifactPaths(rootDir, packageVersion)) {
    rmSync(artifactPath, { force: true, recursive: true });
  }
}

export function collectArtifactSummary(args) {
  const installerPath = args.collectInstallers()[0] ?? resolve(args.rootDir, args.outputDir, `${args.installerBaseName}.exe`);
  const unpackedPath = resolve(args.rootDir, args.outputDir, 'win-unpacked');
  return {
    installer: existsSync(installerPath) ? formatBytes(statSync(installerPath).size) : 'missing',
    unpacked: existsSync(unpackedPath) ? formatBytes(directorySizeBytes(unpackedPath)) : 'missing'
  };
}
