import path from 'node:path';

// Compare portable output identities without changing the user's displayed spelling.
export function mirrorPathKey(value: string) {
  return value.normalize('NFC').toLowerCase();
}

export function collectProtectedMirrorPaths(targetPaths: string[]) {
  const protectedPaths = new Set<string>();
  for (const targetPath of targetPaths) {
    let current = path.resolve(targetPath);
    while (!protectedPaths.has(mirrorPathKey(current))) {
      protectedPaths.add(mirrorPathKey(current));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return protectedPaths;
}
