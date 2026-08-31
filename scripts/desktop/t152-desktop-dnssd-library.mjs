import fs from 'node:fs';
import path from 'node:path';

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative));
}

function assertRealDirectory(directory) {
  const resolved = path.resolve(directory);
  if (fs.realpathSync(resolved) !== resolved || fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error('T152 desktop DNS-SD library root must be a real non-symlink directory.');
  }
  return resolved;
}

export function createT152DesktopDnsSdLibrary({ attemptId, baseRoot, evidenceRoot, sourceRoot }) {
  if (!/^[0-9a-f-]{36}$/u.test(attemptId ?? '') || !path.isAbsolute(baseRoot ?? '')) {
    throw new Error('T152 desktop DNS-SD short library inputs are invalid.');
  }
  fs.mkdirSync(baseRoot, { recursive: true });
  const realBase = assertRealDirectory(baseRoot);
  const realEvidence = path.resolve(evidenceRoot);
  const realSource = path.resolve(sourceRoot);
  if (isInside(realEvidence, realBase) || isInside(realSource, realBase)
      || isInside(realBase, realEvidence) || isInside(realBase, realSource)) {
    throw new Error('T152 desktop DNS-SD library root must be outside source and evidence roots.');
  }
  const attemptRoot = path.join(realBase, attemptId);
  fs.mkdirSync(attemptRoot, { recursive: false });
  const libraryHome = path.join(attemptRoot, 'library');
  fs.mkdirSync(libraryHome, { recursive: false });
  return { attemptRoot: assertRealDirectory(attemptRoot),
    libraryHome: assertRealDirectory(libraryHome) };
}
