// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  createOrdinaryBuildEnv,
  createUpgradeBuildEnv,
} from './ios-database-upgrade-acceptance-runner.mjs';
import {
  expectedUpgradeSnapshot,
  parseUpgradeSnapshot,
  verifyIosDatabaseUpgradeAcceptance
} from './ios-database-upgrade-acceptance-snapshot.mjs';

const current = expectedUpgradeSnapshot(20, ['import_content_fingerprint', 'import_source_fingerprint'], 1);
const legacy = expectedUpgradeSnapshot(19, ['import_content_fingerprint', 'import_source_fingerprint'], 0);
const passed = {
  bootstrap: { database_ready: true }, error: null, phase: 'upgraded',
  scenario: 'database-upgrade-runtime', status: 'passed'
};
const failed = {
  error: 'Injected iOS database upgrade acceptance fault.', phase: 'failed',
  scenario: 'database-upgrade-runtime', status: 'failed'
};

describe('iOS database upgrade acceptance runner', () => {
  it('keeps the independent fault flag out of normal acceptance builds', () => {
    const polluted = {
      KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'ambient',
      VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT: '1'
    };
    expect(createUpgradeBuildEnv(polluted, false)).toEqual({
      KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'database-upgrade-runtime'
    });
    expect(createUpgradeBuildEnv(polluted, true)).toMatchObject({
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'database-upgrade-runtime',
      VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT: '1'
    });
    expect(createOrdinaryBuildEnv(polluted)).toEqual({ KEEP: 'yes' });
  });

  it('parses the complete permanent-state snapshot', () => {
    const output = JSON.stringify([{ ...current, provenance_columns: current.provenance_columns.join(',') }]);
    expect(parseUpgradeSnapshot(output)).toEqual(current);
  });

  it('requires success, restart, rollback, and same-container recovery evidence', () => {
    expect(verifyIosDatabaseUpgradeAcceptance({
      failed, failedSnapshot: legacy, first: passed, firstSnapshot: current,
      recovered: passed, recoveredSnapshot: current, second: passed, secondSnapshot: current
    }, (value) => value)).toMatchObject({ failedSnapshot: legacy, recoveredSnapshot: current });
    expect(() => verifyIosDatabaseUpgradeAcceptance({
      failed, failedSnapshot: current, first: passed, firstSnapshot: current,
      recovered: passed, recoveredSnapshot: current, second: passed, secondSnapshot: current
    }, (value) => value)).toThrow('SQLite evidence is incomplete');
  });
});
