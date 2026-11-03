// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it, vi } from 'vitest';

import { createFriLegacyFixture, readFriUpgradeFacts, verifyFriUpgradeFacts } from './fri-database-upgrade.mjs';
import { buildFriDevWorkflowCommands, runFriDevWorkflow } from './fri-dev-workflow.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temporary() {
  const parent = path.resolve('.tmp/artifacts/fri-upgrade-contracts');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'attempt-'));
  roots.push(root);
  return root;
}

it('selects the upgrade UI test and prepares old state between build and native execution', async () => {
  const stages = [];
  const run = vi.fn((_command, _args, options) => { stages.push(options.stage); });
  const retention = vi.fn(async () => { stages.push('retention'); });
  await runFriDevWorkflow({ repoRoot: '/repo', evidenceRoot: temporary(), runnerPath: '/bin/sh',
    scenario: 'database-upgrade', legacyFramework: '/explicit/SQLCipher.framework',
    readiness: async () => { stages.push('readiness'); }, retention, run,
    upgradePrepare: async () => { stages.push('prepare-old-database'); },
    upgradeFinish: async () => { stages.push('verify-preserved-facts'); } });
  expect(stages).toEqual(['companion-build', 'capacitor-ios-sync', 'readiness', 'retention',
    'fri-dev-xcuitest-build', 'prepare-old-database', 'fri-dev-xcuitest-run', 'verify-preserved-facts']);
  expect(retention).toHaveBeenCalledWith(expect.objectContaining({ freshAcceptance: true }));
  const commands = buildFriDevWorkflowCommands({ repoRoot: '/repo', evidenceRoot: '/evidence', scenario: 'database-upgrade' });
  expect(commands[2].args).toContain('AppPhysicalUITests/FoliolePhysicalDatabaseUpgradeUITests/testRetainsLegacyFactsAcrossInstallAndRestart');
  expect(commands[0].env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE).toBe('0');
});

it('does not begin a build without an explicit old framework', async () => {
  const run = vi.fn();
  await expect(runFriDevWorkflow({ repoRoot: '/repo', runnerPath: '/bin/sh', evidenceRoot: temporary(),
    scenario: 'database-upgrade', run })).rejects.toThrow(/explicit legacy/u);
  expect(run).not.toHaveBeenCalled();
});

it('rejects changed original content, review facts, cursor or a missing subsequent write', () => {
  const before = { body: 'Legacy upgrade retained sentence.', grade: 3, operation: 'op-1',
    due: '2026-07-21T00:00:00.000Z', cursor: '41', new_writes: 0 };
  const after = { ...before, new_writes: 1 };
  expect(verifyFriUpgradeFacts(before, after)).toEqual({ retained: true, subsequentWrite: true });
  for (const change of [{ body: '' }, { grade: 1 }, { operation: null }, { due: null }, { cursor: '0' }, { new_writes: 0 }]) {
    expect(() => verifyFriUpgradeFacts(before, { ...after, ...change })).toThrow();
  }
});

// SKIP: Requires an explicitly supplied retained Apple 4.17 framework | 2026-11-03 | revive: configure FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK
it.runIf(process.platform === 'darwin' && Boolean(process.env.FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK))(
  'uses the real old engine to preserve a database and checks persisted facts through SQLite', () => {
    const root = temporary();
    const fixture = createFriLegacyFixture({ repoRoot: process.cwd(), evidenceRoot: root,
      legacyFramework: process.env.FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK });
    expect(fixture.identity.version).toContain('4.17.0');
    const before = readFriUpgradeFacts(fixture.database);
    execFileSync('sqlite3', [fixture.database, `INSERT INTO nodes(id,kind,title,content,created_at,updated_at)
      VALUES('new','topic','new','Fri upgrade subsequent write.','2026-11-03','2026-11-03');`]);
    expect(verifyFriUpgradeFacts(before, readFriUpgradeFacts(fixture.database))).toMatchObject({ retained: true });
    execFileSync('sqlite3', [fixture.database, "DELETE FROM review_log WHERE id='review-1'"]);
    expect(() => verifyFriUpgradeFacts(before, readFriUpgradeFacts(fixture.database))).toThrow(/grade/u);
  }
);
