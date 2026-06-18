import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.ts', '.cjs']);
const DEFAULT_SOURCE_ROOTS = ['electron', path.join('lib', 'core'), path.join('lib', 'platform')];
const DEFAULT_SOURCE_EXCLUDES = [path.join('lib', 'core', 'database', 'androidCompanion*.ts')];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function collectFiles(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const files = [];
  const pending = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

function getNewestFile(filePaths) {
  let newest = null;

  for (const filePath of filePaths) {
    const stats = fs.statSync(filePath);
    if (newest === null || stats.mtimeMs > newest.mtimeMs) {
      newest = { mtimeMs: stats.mtimeMs, path: filePath };
    }
  }

  return newest;
}

function createRelativePath(repoRoot, targetPath) {
  return path.relative(repoRoot, targetPath) || path.basename(targetPath);
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function matchesSourceExclude(relativePath, pattern) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedPattern = normalizeRelativePath(pattern);
  if (!normalizedPattern.includes('*')) {
    return normalizedPath === normalizedPattern;
  }

  const [prefix, suffix] = normalizedPattern.split('*');
  return normalizedPath.startsWith(prefix) && normalizedPath.endsWith(suffix);
}

function isExcludedSource(repoRoot, filePath, sourceExcludes) {
  const relativePath = createRelativePath(repoRoot, filePath);
  return sourceExcludes.some((pattern) => matchesSourceExclude(relativePath, pattern));
}

function isTestSource(filePath) {
  const basename = path.basename(filePath);
  return basename.includes('.test.') || basename.includes('.spec.');
}

function resolveSourceRoots(repoRoot, sourceRoots) {
  return sourceRoots.map((sourceRoot) => (path.isAbsolute(sourceRoot) ? sourceRoot : path.join(repoRoot, sourceRoot)));
}

function resolveExpectedDistPath(repoRoot, distRoot, sourcePath) {
  const relativePath = path.relative(repoRoot, sourcePath);
  if (path.extname(relativePath) !== '.ts') {
    return null;
  }

  return path.join(distRoot, relativePath.replace(/\.ts$/, '.js'));
}

export function inspectElectronDistFreshness({
  repoRoot = resolveRepoRoot(),
  sourceExcludes = DEFAULT_SOURCE_EXCLUDES,
  sourceRoots = DEFAULT_SOURCE_ROOTS,
  distRoot = path.join(repoRoot, 'dist')
} = {}) {
  const resolvedSourceRoots = resolveSourceRoots(repoRoot, sourceRoots);
  const sourceFiles = resolvedSourceRoots.flatMap((sourceRoot) =>
    collectFiles(sourceRoot).filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)))
  ).filter((filePath) => !isTestSource(filePath) && !isExcludedSource(repoRoot, filePath, sourceExcludes));
  const distFiles = collectFiles(distRoot);
  const newestSource = getNewestFile(sourceFiles);
  const newestDist = getNewestFile(distFiles);
  const problems = [];

  if (sourceFiles.length === 0) {
    return {
      checkedDistCount: distFiles.length,
      checkedSourceCount: 0,
      ok: true,
      problems,
      repoRoot
    };
  }

  if (newestDist === null) {
    problems.push({
      distRoot: createRelativePath(repoRoot, distRoot),
      reason: 'compiled-output-missing',
      source: createRelativePath(repoRoot, newestSource.path)
    });
  } else if (newestSource.mtimeMs > newestDist.mtimeMs) {
    problems.push({
      newestDist: createRelativePath(repoRoot, newestDist.path),
      newestSource: createRelativePath(repoRoot, newestSource.path),
      reason: 'newest-source-newer-than-dist'
    });
  }

  for (const sourcePath of sourceFiles) {
    const expectedDistPath = resolveExpectedDistPath(repoRoot, distRoot, sourcePath);
    if (!expectedDistPath) {
      continue;
    }
    if (!fs.existsSync(expectedDistPath)) {
      problems.push({
        expectedDist: createRelativePath(repoRoot, expectedDistPath),
        reason: 'missing-compiled-output',
        source: createRelativePath(repoRoot, sourcePath)
      });
      continue;
    }

    const sourceMtimeMs = fs.statSync(sourcePath).mtimeMs;
    const expectedDistMtimeMs = fs.statSync(expectedDistPath).mtimeMs;
    if (sourceMtimeMs > expectedDistMtimeMs) {
      problems.push({
        expectedDist: createRelativePath(repoRoot, expectedDistPath),
        reason: 'source-newer-than-compiled-output',
        source: createRelativePath(repoRoot, sourcePath)
      });
    }
  }

  return {
    checkedDistCount: distFiles.length,
    checkedSourceCount: sourceFiles.length,
    newestDist: newestDist ? createRelativePath(repoRoot, newestDist.path) : null,
    newestSource: newestSource ? createRelativePath(repoRoot, newestSource.path) : null,
    ok: problems.length === 0,
    problems,
    repoRoot
  };
}

function printResult(result) {
  if (result.ok) {
    process.stdout.write(
      `[check-electron-dist-fresh] status: FRESH checked_sources=${result.checkedSourceCount} checked_outputs=${result.checkedDistCount} newest_source=${result.newestSource ?? 'none'} newest_output=${result.newestDist ?? 'none'}\n`
    );
    return;
  }

  process.stderr.write(
    `[check-electron-dist-fresh] status: STALE checked_sources=${result.checkedSourceCount} checked_outputs=${result.checkedDistCount}\n`
  );
  for (const problem of result.problems) {
    const detail = Object.entries(problem)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    process.stderr.write(`[check-electron-dist-fresh] ${detail}\n`);
  }
}

function runCli() {
  const repoRoot = process.env.FOLIOLE_ELECTRON_FRESHNESS_REPO_ROOT?.trim() || resolveRepoRoot();
  const distRoot = process.env.FOLIOLE_ELECTRON_DIST_ROOT?.trim() || path.join(repoRoot, 'dist');
  const sourceRoots = process.env.FOLIOLE_ELECTRON_SOURCE_ROOTS?.trim()
    ? process.env.FOLIOLE_ELECTRON_SOURCE_ROOTS.split(path.delimiter).filter(Boolean)
    : DEFAULT_SOURCE_ROOTS;
  const result = inspectElectronDistFreshness({ distRoot, repoRoot, sourceRoots });

  printResult(result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
