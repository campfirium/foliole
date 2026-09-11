import fs from 'node:fs';
import path from 'node:path';

/* global process */

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';
const EVENT_KEYS = new Set([
  'device_identity_key', 'occurred_at', 'result', 'run_id', 'started_at', 'status',
  'trigger_reason'
]);
const VERSION_KEYS = new Set([
  'content_hash', 'forks', 'is_current', 'object_id', 'parents', 'version_id'
]);

function projectionFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export function friAcceptanceBundle(taskId) {
  if (!/^t[0-9]+$/u.test(taskId ?? '')) {
    throw new Error('Fri acceptance task identity is missing or invalid.');
  }
  const suffix = `.${taskId}`;
  return { applicationId: `com.foliole.ios${suffix}`, suffix };
}

function loadProjection(root, buildIdentity, applicationId) {
  for (const file of projectionFiles(root)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (value?.build_identity !== buildIdentity
        || value.container_identity !== applicationId
        || !Array.isArray(value.events)) continue;
    if (Object.keys(value).sort().join(',') !==
        'build_identity,conflict_versions,container_identity,events') {
      throw new Error('Fri acceptance projection exposed unsupported fields.');
    }
    if (!Array.isArray(value.conflict_versions)) {
      throw new Error('Fri acceptance conflict version projection is missing.');
    }
    for (const event of value.events) {
      if (!Object.keys(event).every((key) => EVENT_KEYS.has(key))) {
        throw new Error('Fri sync event projection exposed unsupported fields.');
      }
    }
    for (const version of value.conflict_versions) {
      if (!Object.keys(version).every((key) => VERSION_KEYS.has(key))
          || !Array.isArray(version.parents) || !Array.isArray(version.forks)) {
        throw new Error('Fri conflict version projection exposed unsupported fields.');
      }
    }
    return { file, value };
  }
  throw new Error('Fri acceptance sync event projection attachment is missing.');
}

export function resolveFriEvidenceRoot(result, fallbackRoot) {
  for (const line of [...result.lines].reverse()) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.classification === 'accepted' && typeof value.promoted === 'string') {
      return value.promoted;
    }
  }
  return fallbackRoot;
}

export function persistFriProjection(projection, evidenceRoot) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const file = path.join(evidenceRoot, 'projection.json');
  fs.copyFileSync(projection.file, file);
  return { file, value: projection.value };
}

export async function runFriSyncEventProjection({ buildIdentity, evidenceRoot, execute,
  repoRoot, bundle, desktopForkLabel, runnerArgs = [] }) {
  const result = await execute('bash', [FRI_RUNNER,
    '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
    '--artifacts-dir', evidenceRoot,
    '--keep-app-foreground', bundle.applicationId,
    ...runnerArgs,
    '--only-testing', 'AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests/testProjectsSyncEvents'
  ], { action: 'fri-sync-event-projection', cwd: repoRoot, env: { ...process.env,
    FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
    ...(desktopForkLabel ? { FOLIOLE_T152_DESKTOP_FORK_LABEL: desktopForkLabel } : {}),
    FOLIOLE_T152_BUILD_IDENTITY: buildIdentity }, hardDeadlineMs: 30 * 60_000,
  host: 'ios-b', stage: 'fri-sync-event-projection' });
  if (result.code !== 0) throw new Error('Fri acceptance sync event projection failed.');
  const projection = loadProjection(resolveFriEvidenceRoot(result, evidenceRoot),
    buildIdentity, bundle.applicationId);
  return persistFriProjection(projection, evidenceRoot);
}
