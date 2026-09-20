import path from 'node:path';

// Share verified download archives, never the capsule's installed dependency tree.
// The repository owns this rebuildable cache; capsule cleanup must leave it intact.
export function frozenNpmCiArgs(sourceRepoRoot) {
  return ['ci', '--cache', path.resolve(sourceRepoRoot, '.cache', 'npm-downloads')];
}
