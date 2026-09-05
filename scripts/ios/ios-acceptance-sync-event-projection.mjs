import fs from 'node:fs';
import path from 'node:path';

/* global process */

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';
const EVENT_KEYS = new Set([
  'device_identity_key', 'occurred_at', 'result', 'run_id', 'started_at', 'status',
  'trigger_reason'
]);

function projectionFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export function friAcceptanceBundle(attemptId) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(attemptId ?? '')) {
    throw new Error('Fri acceptance attempt identity is missing or invalid.');
  }
  const suffix = `.t152acceptance.a${attemptId.replaceAll('-', '').toLowerCase()}`;
  return { applicationId: `com.foliole.ios${suffix}`, suffix };
}

function loadProjection(root, buildIdentity, applicationId) {
  for (const file of projectionFiles(root)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (value?.build_identity !== buildIdentity
        || value.container_identity !== applicationId
        || !Array.isArray(value.events)) continue;
    if (Object.keys(value).sort().join(',') !== 'build_identity,container_identity,events') {
      throw new Error('Fri acceptance projection exposed unsupported fields.');
    }
    for (const event of value.events) {
      if (!Object.keys(event).every((key) => EVENT_KEYS.has(key))) {
        throw new Error('Fri sync event projection exposed unsupported fields.');
      }
    }
    return { file, value };
  }
  throw new Error('Fri acceptance sync event projection attachment is missing.');
}

export async function runFriSyncEventProjection({ buildIdentity, evidenceRoot, execute,
  repoRoot, bundle }) {
  const result = await execute('bash', [FRI_RUNNER,
    '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
    '--artifacts-dir', evidenceRoot,
    '--keep-app-foreground', bundle.applicationId,
    '--only-testing', 'AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests/testProjectsSyncEvents'
  ], { action: 'fri-sync-event-projection', cwd: repoRoot, env: { ...process.env,
    FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
    FOLIOLE_T152_BUILD_IDENTITY: buildIdentity }, hardDeadlineMs: 30 * 60_000,
  host: 'ios-b', stage: 'fri-sync-event-projection' });
  if (result.code !== 0) throw new Error('Fri acceptance sync event projection failed.');
  return loadProjection(evidenceRoot, buildIdentity, bundle.applicationId);
}

export async function runFriGroupIdentityPreflight({ evidenceRoot, execute, groupId, groupTag,
  repoRoot, bundle }) {
  const result = await execute('bash', [FRI_RUNNER,
    '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
    '--artifacts-dir', evidenceRoot,
    '--keep-app-foreground', bundle.applicationId,
    '--only-testing', 'AppAcceptanceProjectionTests/FolioleAcceptanceGroupDiscoveryTests/testFindsExpectedSyncGroup'
  ], { action: 'fri-group-identity', cwd: repoRoot, env: { ...process.env,
    FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
    FOLIOLE_T152_EXPECTED_GROUP_ID: groupId, FOLIOLE_T152_EXPECTED_GROUP_TAG: groupTag },
  hardDeadlineMs: 30 * 60_000, host: 'ios-b', stage: 'fri-group-identity' });
  if (result.code !== 0) throw new Error('Fri product discovery did not uniquely match the expected group.');
  return result;
}
