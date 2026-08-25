// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  applyUnifiedMigration,
  rollbackUnifiedMigration
} from '../../lib/core/database/syncGroupUnifiedMigrationCoordinator.js';
import { readUnifiedProtectedFixtureSnapshot } from '../../lib/core/database/syncGroupUnifiedMigrationFixture.js';

import { createUnifiedDesktopMigrationHarness } from './syncGroupUnifiedMigrationTestSupport.js';

const RECEIPT = path.resolve('.tmp/artifacts/sync-group-migration/desktop/receipt.json');

it('accepts the frozen desktop unified migration fixture and writes a durable receipt', async () => {
  const candidate = candidateRevision();
  const harness = await createUnifiedDesktopMigrationHarness();
  try {
    const before = await protectedState(harness.input.libraries);
    const secureBefore = harness.secureStore.snapshot();
    const applied = await applyUnifiedMigration(harness.input);
    const appliedVersions = versions(harness.databases);
    const registry = await harness.registry.read();
    const protectedAfterApply = await protectedState(harness.input.libraries);
    await rollbackUnifiedMigration(harness.input);
    const rollbackVersions = versions(harness.databases);
    const protectedAfterRollback = await protectedState(harness.input.libraries);
    const receipt = {
      accepted_tip: candidate.revision,
      active_binding: applied.decision.active_binding,
      candidate_state: candidate.state,
      decision_digest: applied.decision_digest,
      journal_phase: registry.journal?.phase,
      protected_after_apply: protectedAfterApply,
      protected_after_rollback: protectedAfterRollback,
      protected_before: before,
      schema_versions_after_apply: appliedVersions,
      schema_versions_after_rollback: rollbackVersions,
      sealed_credentials_unchanged: JSON.stringify(harness.secureStore.snapshot()) === JSON.stringify(secureBefore),
      status: 'passed'
    };
    expect(receipt).toMatchObject({
      journal_phase: 'committed',
      schema_versions_after_apply: [78, 78],
      schema_versions_after_rollback: [77, 77],
      sealed_credentials_unchanged: true,
      status: 'passed'
    });
    if (process.env.FOLIOLE_SYNC_GROUP_MIGRATION_ACCEPTANCE === '1') {
      expect(receipt.candidate_state).toBe('frozen');
    }
    expect(protectedAfterApply).toEqual(before);
    expect(protectedAfterRollback).toEqual(before);
    fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
    fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    harness.close();
  }
});

function candidateRevision() {
  const head = git(['rev-parse', 'HEAD']).trim();
  if (process.env.FOLIOLE_SYNC_GROUP_MIGRATION_ACCEPTANCE !== '1') {
    return { revision: head, state: 'preflight' } as const;
  }
  const status = git(['status', '--porcelain', '--untracked-files=no']).trim();
  if (status) throw new Error('desktop migration acceptance requires a clean tracked worktree');
  if (head !== git(['rev-parse', 'origin/dev']).trim()) {
    throw new Error('desktop migration acceptance requires HEAD == origin/dev');
  }
  return { revision: head, state: 'frozen' } as const;
}

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function protectedState(libraries: Array<{ db: Parameters<typeof readUnifiedProtectedFixtureSnapshot>[0] }>) {
  return Promise.all(libraries.map(({ db }) => readUnifiedProtectedFixtureSnapshot(db)));
}

function versions(databases: Array<{ pragma(source: string, options: { simple: true }): unknown }>) {
  return databases.map((database) => database.pragma('user_version', { simple: true }));
}
