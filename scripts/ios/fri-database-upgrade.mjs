import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { resolveIosDatabaseUpgradeContractFixture } from './ios-database-upgrade-contract-fixture.mjs';
import { FRI_COREDEVICE_ID, FRI_PRODUCTION_APP_ID, FRI_DEV_SUFFIX } from './fri-app-retention.mjs';

const FRI_DEV_APP_ID = `${FRI_PRODUCTION_APP_ID}${FRI_DEV_SUFFIX}`;

const DATABASE = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const BODY = 'Legacy upgrade retained sentence.';
const NEW_BODY = 'Fri upgrade subsequent write.';
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const deviceArgs = ['--device', FRI_COREDEVICE_ID];
const containerArgs = ['--domain-type', 'appDataContainer', '--domain-identifier', FRI_DEV_APP_ID];
const capture = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

export function readFriUpgradeFacts(database) {
  const sql = `SELECT
    (SELECT content FROM nodes WHERE id='upgrade-node') body,
    (SELECT grade FROM review_log WHERE id='review-1') grade,
    (SELECT op_id FROM review_log WHERE id='review-1') operation,
    (SELECT due FROM node_review WHERE node_id='upgrade-node') due,
    (SELECT value FROM companion_meta WHERE key='sync_pack_cursor') cursor,
    (SELECT count(*) FROM nodes WHERE content='${NEW_BODY}' AND deleted_at IS NULL) new_writes;`;
  return JSON.parse(capture('sqlite3', ['-readonly', '-json', database, sql]))[0];
}

export function verifyFriUpgradeFacts(before, after) {
  for (const [key, value] of Object.entries({ body: BODY, grade: 3, operation: 'op-1',
    due: '2026-07-21T00:00:00.000Z', cursor: '41' })) {
    if (before?.[key] !== value || after?.[key] !== value) throw new Error(`Fri upgrade changed retained ${key}`);
  }
  if (after.new_writes !== 1) throw new Error('Fri upgrade subsequent UI write was not persisted');
  return { retained: true, subsequentWrite: true };
}

export function createFriLegacyFixture({ repoRoot, evidenceRoot, legacyFramework }) {
  if (!legacyFramework || !path.isAbsolute(legacyFramework)
    || !existsSync(path.join(legacyFramework, 'SQLCipher'))) throw new Error('Provide the retained SQLCipher 4.17 framework explicitly');
  const directory = path.join(evidenceRoot, 'seed', 'CapacitorDatabase');
  mkdirSync(directory, { recursive: true });
  const database = path.join(directory, path.basename(DATABASE));
  if (existsSync(database)) throw new Error('Preserve an existing upgrade attempt; use a new evidence directory');
  const binary = path.join(evidenceRoot, 'legacy-fixture-builder');
  const parent = path.dirname(legacyFramework);
  capture('xcrun', ['clang', path.join(repoRoot, 'scripts/ios/fri-upgrade-fixture.c'),
    '-I', path.join(legacyFramework, 'Headers'), '-F', parent, '-framework', 'SQLCipher',
    `-Wl,-rpath,${parent}`, '-o', binary]);
  const fixture = resolveIosDatabaseUpgradeContractFixture(repoRoot);
  const version = capture(binary, [fixture.databasePath, database]);
  const identity = { version, source: fixture.identity, sha256: digest(database),
    frameworkSha256: digest(path.join(legacyFramework, 'SQLCipher')), facts: readFriUpgradeFacts(database) };
  writeFileSync(path.join(evidenceRoot, 'legacy-fixture.json'), `${JSON.stringify(identity, null, 2)}\n`);
  return { database, directory, identity };
}

export function verifyFriCipherArtifact({ pin, appUuid, artifactUuid }) {
  if (pin?.state?.version !== '4.20.0' || !/^[a-f0-9]{40}$/u.test(pin?.state?.revision ?? '')) {
    throw new Error('Upgrade app requires the pinned SQLCipher 4.20.0 dependency');
  }
  if (!appUuid || !artifactUuid || appUuid !== artifactUuid) throw new Error('Upgrade app differs from the pinned SQLCipher binary');
  return pin.state.version;
}

function builtUpgradeApp(repoRoot) {
  const app = path.join(repoRoot, '.cache/ios-physical-acceptance/AppPhysicalUITests/DerivedData/Build/Products/Debug-iphoneos/App.app');
  const read = (file, key) => capture('plutil', ['-extract', key, 'raw', '-o', '-', file]);
  if (read(path.join(app, 'Info.plist'), 'CFBundleIdentifier') !== FRI_DEV_APP_ID) {
    throw new Error('Upgrade acceptance may install only the fixed development app');
  }
  const pin = JSON.parse(readFileSync(path.join(repoRoot,
    'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), 'utf8'))
    .pins.find(entry => entry.identity === 'sqlcipher.swift');
  const artifact = path.join(repoRoot, '.cache/ios-physical-acceptance/AppPhysicalUITests/DerivedData',
    'SourcePackages/artifacts/sqlcipher.swift/SQLCipher/SQLCipher.xcframework/ios-arm64/SQLCipher.framework/SQLCipher');
  const uuid = binary => capture('xcrun', ['dwarfdump', '--uuid', binary]).match(/^UUID: ([A-F0-9-]+) \(arm64\)/mu)?.[1];
  const version = verifyFriCipherArtifact({ pin, artifactUuid: uuid(artifact),
    appUuid: uuid(path.join(app, 'Frameworks/SQLCipher.framework/SQLCipher')) });
  return { app, version };
}

export async function prepareFriDatabaseUpgrade({ repoRoot, evidenceRoot, legacyFramework, run }) {
  const fixture = createFriLegacyFixture({ repoRoot, evidenceRoot, legacyFramework });
  const built = builtUpgradeApp(repoRoot);
  const device = async (args, stage) => run('xcrun', ['devicectl', 'device', ...args, ...deviceArgs], { cwd: repoRoot, stage });
  await device(['install', 'app', built.app], 'fri-upgrade-container-install');
  await device(['copy', 'to', '--source', fixture.directory, '--destination', 'Library/CapacitorDatabase', ...containerArgs], 'fri-upgrade-legacy-seed');
  const before = path.join(evidenceRoot, 'before-install.db');
  await device(['copy', 'from', '--source', DATABASE, '--destination', before, ...containerArgs], 'fri-upgrade-before-install');
  if (digest(before) !== fixture.identity.sha256) throw new Error('Fri legacy seed differs from the verified old-engine file');
  await device(['install', 'app', built.app], 'fri-upgrade-preserving-install');
  const after = path.join(evidenceRoot, 'after-install.db');
  await device(['copy', 'from', '--source', DATABASE, '--destination', after, ...containerArgs], 'fri-upgrade-after-install');
  if (digest(before) !== digest(after)) throw new Error('Native covering installation changed the old database before launch');
  writeFileSync(path.join(evidenceRoot, 'covering-install.json'), JSON.stringify({
    appId: FRI_DEV_APP_ID, targetCipher: built.version, legacySha256: digest(before), retained: true
  }, null, 2));
}

export async function finishFriDatabaseUpgrade({ repoRoot, evidenceRoot, run }) {
  const directory = path.join(evidenceRoot, 'after-runtime');
  await run('xcrun', ['devicectl', 'device', 'copy', 'from', ...deviceArgs, ...containerArgs,
    '--source', 'Library/CapacitorDatabase', '--destination', directory], { cwd: repoRoot, stage: 'fri-upgrade-runtime-snapshot' });
  const before = readFriUpgradeFacts(path.join(evidenceRoot, 'before-install.db'));
  const after = readFriUpgradeFacts(path.join(directory, path.basename(DATABASE)));
  const result = { ...verifyFriUpgradeFacts(before, after), before, after,
    scope: 'Old-engine file preservation, native SQLite migration, UI read/search/write and restart; no live peer sync claim.' };
  writeFileSync(path.join(evidenceRoot, 'database-upgrade-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
