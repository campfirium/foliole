import fs from 'node:fs';
import path from 'node:path';

const RUNS = ['.tmp', 'artifacts', 'multi-device-sync', 'runs'];
const PERSONAL_LIBRARY = path.resolve('/Users/roamer/Documents/Foliole');

function inside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function runRoot(repoRoot, runId) {
  if (!/^[A-Za-z0-9.-]{1,96}$/u.test(runId ?? '')) throw new Error('Invalid acceptance run owner.');
  return path.join(repoRoot, ...RUNS, runId);
}

export function isolatedMacosRoot(repoRoot, runId) {
  return path.join(runRoot(repoRoot, runId), 'macos-a');
}

export function assertIsolatedMacosRoot({ fsApi = fs, repoRoot, root, runId }) {
  const expectedParent = path.join(repoRoot, ...RUNS);
  const resolved = path.resolve(root);
  if (!inside(resolved, path.resolve(expectedParent)) || resolved === PERSONAL_LIBRARY
      || inside(PERSONAL_LIBRARY, resolved) || inside(resolved, PERSONAL_LIBRARY)) {
    throw Object.assign(new Error('macOS acceptance library escaped the isolated root.'), {
      missingFact: 'macos_library_not_isolated'
    });
  }
  const marker = path.join(resolved, 'acceptance-owner.json');
  if (!fsApi.existsSync(marker)) throw Object.assign(new Error('Acceptance owner marker is missing.'), {
    missingFact: 'isolated_owner_missing'
  });
  const owner = JSON.parse(fsApi.readFileSync(marker, 'utf8'));
  if (owner.runId !== runId || owner.purpose !== 'multi-device-sync-acceptance') {
    throw Object.assign(new Error('Acceptance owner marker differs.'), {
      missingFact: 'isolated_owner_mismatch'
    });
  }
  return { marker, root: resolved };
}

export function createIsolatedMacosRoot({ fsApi = fs, repoRoot, runId }) {
  const root = isolatedMacosRoot(repoRoot, runId);
  if (fsApi.existsSync(root) && fsApi.readdirSync(root).length > 0) {
    return assertIsolatedMacosRoot({ fsApi, repoRoot, root, runId });
  }
  fsApi.mkdirSync(root, { recursive: true });
  fsApi.writeFileSync(path.join(root, 'acceptance-owner.json'), `${JSON.stringify({
    createdAt: new Date().toISOString(), purpose: 'multi-device-sync-acceptance', runId,
    schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return assertIsolatedMacosRoot({ fsApi, repoRoot, root, runId });
}

export function cleanupOwnedRun({ fsApi = fs, repoRoot, runId }) {
  const root = runRoot(repoRoot, runId);
  const macosRoot = path.join(root, 'macos-a');
  assertIsolatedMacosRoot({ fsApi, repoRoot, root: macosRoot, runId });
  fsApi.rmSync(root, { recursive: true });
}
