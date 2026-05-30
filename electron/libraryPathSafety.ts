import path from 'node:path';

export function normalizeSafetyPath(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return path.resolve(trimmed).replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

export function isSameOrNestedPath(childPath: string | null | undefined, parentPath: string | null | undefined) {
  const child = normalizeSafetyPath(childPath);
  const parent = normalizeSafetyPath(parentPath);
  if (!child || !parent) {
    return false;
  }
  return child === parent || child.startsWith(`${parent}/`);
}

export function doPathsOverlap(leftPath: string | null | undefined, rightPath: string | null | undefined) {
  return isSameOrNestedPath(leftPath, rightPath) || isSameOrNestedPath(rightPath, leftPath);
}

export interface SafetyPathCandidate {
  label: string;
  path: string | null | undefined;
}

export function findUnsafePathOverlap(candidates: SafetyPathCandidate[]) {
  const normalized = candidates.filter((candidate) => normalizeSafetyPath(candidate.path));
  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    const left = normalized[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const right = normalized[rightIndex];
      if (right && doPathsOverlap(left.path, right.path)) {
        return { left, right };
      }
    }
  }
  return null;
}

export function assertNoUnsafePathOverlap(candidates: SafetyPathCandidate[]) {
  const overlap = findUnsafePathOverlap(candidates);
  if (!overlap) {
    return;
  }
  throw new Error(`${overlap.left.label} cannot overlap ${overlap.right.label}.`);
}

export function assertMirrorSeparatedFromImportPath(args: {
  importPath: string;
  label: string;
  mirrorPath: string;
}) {
  if (!doPathsOverlap(args.importPath, args.mirrorPath)) {
    return;
  }
  throw new Error(`${args.label} cannot overlap the Mirror output folder.`);
}
