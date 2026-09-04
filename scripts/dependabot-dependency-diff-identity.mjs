const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
];
const ALLOWED_FILES = new Set(['package.json', 'package-lock.json']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function equal(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value) {
  if (value && typeof value === 'object') return cloneJson(value);
  if (typeof value !== 'string') throw new TypeError('dependency diff content is missing');
  return JSON.parse(value);
}

function withoutDependencySections(value) {
  const copy = cloneJson(value);
  for (const section of DEPENDENCY_SECTIONS) delete copy[section];
  return copy;
}

function dependencyChanges(before, after) {
  const changes = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const names = new Set([...Object.keys(before[section] ?? {}), ...Object.keys(after[section] ?? {})]);
    for (const name of names) {
      const from = before[section]?.[name] ?? null;
      const to = after[section]?.[name] ?? null;
      if (from !== to) changes.push({ from, name, section, to });
    }
  }
  return changes;
}

function sameChanges(left, right) {
  return equal(left, right);
}

function directDependencyNames(root) {
  return new Set(DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(root[section] ?? {})));
}

function lockPackagePath(name) {
  return `node_modules/${name}`;
}

function withoutPackages(value) {
  const copy = cloneJson(value);
  delete copy.packages;
  return copy;
}

function packageNameFromLockPath(packagePath) {
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  if (index < 0) return null;
  const remainder = packagePath.slice(index + marker.length);
  if (!remainder) return null;
  if (!remainder.startsWith('@')) return remainder.split('/')[0] || null;
  const [scope, name] = remainder.split('/');
  return scope && name ? `${scope}/${name}` : null;
}

function identifyLockOnlyDiff(beforeLock, afterLock) {
  const beforeRoot = beforeLock.packages?.[''];
  const afterRoot = afterLock.packages?.[''];
  if (!beforeRoot || !afterRoot) return sourceError('lockfile-root-missing');
  if (!equal(beforeRoot, afterRoot) || !equal(withoutPackages(beforeLock), withoutPackages(afterLock))) {
    return unknown('lockfile-root-or-metadata-changed');
  }
  const paths = new Set([
    ...Object.keys(beforeLock.packages ?? {}),
    ...Object.keys(afterLock.packages ?? {})
  ]);
  paths.delete('');
  const changedPaths = [...paths].filter((packagePath) => (
    !equal(beforeLock.packages?.[packagePath], afterLock.packages?.[packagePath])
  ));
  const changedNames = changedPaths.map(packageNameFromLockPath);
  const dependencyNames = [...new Set(changedNames.filter(Boolean))].sort();
  if (!changedPaths.length || changedNames.some((name) => !name)) {
    return unknown('lockfile-has-no-verifiable-package-change');
  }
  return { dependencyKind: 'other', dependencyNames };
}

function directLockIntentMatches(beforeLock, afterLock, changes) {
  const changedNames = new Set(changes.map((change) => change.name));
  const directNames = new Set([
    ...directDependencyNames(beforeLock.packages['']),
    ...directDependencyNames(afterLock.packages[''])
  ]);
  for (const name of directNames) {
    if (changedNames.has(name)) continue;
    const packagePath = lockPackagePath(name);
    if (!equal(beforeLock.packages[packagePath], afterLock.packages[packagePath])) return false;
  }
  for (const change of changes) {
    const installed = afterLock.packages[lockPackagePath(change.name)]?.version;
    if (change.to && /^\d+\.\d+\.\d+$/u.test(change.to) && installed !== change.to) return false;
  }
  return true;
}

function unknown(reason) {
  return { dependencyKind: 'unknown', dependencyNames: [], reason, status: 'unknown' };
}

function sourceError(reason) {
  return { dependencyKind: 'unknown', dependencyNames: [], reason, status: 'source-error' };
}

export function identifyDependabotDependencyDiff(input) {
  if (input?.retrieval?.error) return sourceError('dependency-diff-read-failed');
  if (input?.retrieval?.complete !== true || !Array.isArray(input?.files)) {
    return sourceError('dependency-diff-incomplete');
  }
  if (input?.pr?.authorLogin !== 'app/dependabot' || input?.pr?.baseRefName !== 'dev') {
    return unknown('pull-request-identity-unverified');
  }
  if (!Number.isInteger(input.pr.number) || input.pr.number <= 0 || typeof input.pr.headSha !== 'string' || !input.pr.headSha) {
    return unknown('pull-request-revision-unverified');
  }
  const paths = input.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length || paths.some((file) => !ALLOWED_FILES.has(file))) {
    return unknown('changed-files-outside-dependency-intent');
  }
  const manifestFile = input.files.find((file) => file.path === 'package.json');
  const lockFile = input.files.find((file) => file.path === 'package-lock.json');
  if (!lockFile || input.files.length > 2) return unknown('dependency-files-incomplete');

  let beforeManifest;
  let afterManifest;
  let beforeLock;
  let afterLock;
  try {
    beforeLock = parseJson(lockFile.before);
    afterLock = parseJson(lockFile.after);
    if (manifestFile) {
      beforeManifest = parseJson(manifestFile.before);
      afterManifest = parseJson(manifestFile.after);
    }
  } catch {
    return sourceError('dependency-diff-unparseable');
  }
  if (!manifestFile) {
    const lockOnly = identifyLockOnlyDiff(beforeLock, afterLock);
    if (lockOnly.status) return lockOnly;
    return {
      ...lockOnly,
      headSha: input.pr.headSha,
      prNumber: input.pr.number,
      reason: 'lockfile-transitive-diff-identified',
      status: 'identified'
    };
  }
  if (!equal(withoutDependencySections(beforeManifest), withoutDependencySections(afterManifest))) {
    return unknown('manifest-has-nondependency-changes');
  }
  const changes = dependencyChanges(beforeManifest, afterManifest);
  if (changes.length === 0) return unknown('manifest-has-no-dependency-change');

  const beforeRoot = beforeLock.packages?.[''];
  const afterRoot = afterLock.packages?.[''];
  if (!beforeRoot || !afterRoot) return sourceError('lockfile-root-missing');
  if (!equal(withoutDependencySections(beforeRoot), withoutDependencySections(afterRoot))) {
    return unknown('lockfile-root-has-nondependency-changes');
  }
  if (!sameChanges(changes, dependencyChanges(beforeRoot, afterRoot))) {
    return unknown('manifest-lock-intent-mismatch');
  }
  if (!directLockIntentMatches(beforeLock, afterLock, changes)) {
    return unknown('lockfile-direct-dependency-mismatch');
  }

  const dependencyNames = [...new Set(changes.map((change) => change.name))].sort();
  const dependencyKind = dependencyNames.length === 1 && dependencyNames[0] === 'electron'
    ? 'electron'
    : 'other';
  return {
    dependencyKind,
    dependencyNames,
    headSha: input.pr.headSha,
    prNumber: input.pr.number,
    reason: 'dependency-diff-identified',
    status: 'identified'
  };
}
