import { describe, expect, it } from 'vitest';

// @vitest-environment node

import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';
import { classifySqliteReadError } from './android-database-read-error.mjs';
import {
  inspectStoredSyncGroup, inspectSyncGroupBinding
} from './android-sync-group-readiness-inspection.mjs';

function readiness(snapshot) {
  return pairSyncRecoveryReadiness(snapshot, false);
}

describe('pair sync database availability', () => {
  it('reports when an installed production app blocks read-only database inspection', () => {
    expect(readiness({
      database: { exists: false },
      packageInfo: { debuggable: false, installed: true }
    }).databaseAvailabilityReason).toBe('installed_app_not_debuggable');
  });

  it('distinguishes an unreadable snapshot from a missing or inaccessible database', () => {
    const unreadable = readiness({
      database: { error: 'sqlite open failed', exists: true, unreadable: true },
      packageInfo: { debuggable: true, installed: true }
    });
    expect(unreadable.databaseAvailabilityReason).toBe('database_snapshot_unreadable');
    expect(unreadable.databaseAvailabilityDetail).toBe('sqlite open failed');
    expect(readiness({
      database: { exists: false },
      packageInfo: { debuggable: true, installed: true }
    }).databaseAvailabilityReason).toBe('database_missing_or_inaccessible');
  });

  it('clears the reason when database inspection succeeds', () => {
    expect(readiness({
      database: { exists: true, inspection: { nodeCount: 0 } },
      packageInfo: { debuggable: true, installed: true }
    }).databaseAvailabilityReason).toBeNull();
  });

  it('classifies SQLite failures without exposing database contents', () => {
    expect(classifySqliteReadError(new Error('database disk image is malformed')))
      .toBe('snapshot_inconsistent_or_corrupt');
    expect(classifySqliteReadError(new Error('database is locked'))).toBe('database_locked');
    expect(classifySqliteReadError(new Error('no such table: nodes')))
      .toBe('database_schema_incomplete');
  });

  it('reads a pre-workgroup-key Sync Group database without querying the missing column', () => {
    const queries = [];
    const database = { prepare: (sql) => {
      queries.push(sql);
      return {
        all: () => [],
        get: (value) => sql.includes('sqlite_master')
          ? ['companion_meta', 'sync_groups'].includes(value) ? { present: 1 } : undefined
          : undefined
      };
    } };
    expect(inspectPairSyncRecoveryWorkspace(database).workgroupKeyPresent).toBe(false);
    expect(queries.some((sql) => sql.includes('WHERE workgroup_key'))).toBe(false);
  });

  it('recovers a unique legacy binding from the active member fact', () => {
    const database = { prepare: (sql) => ({
      all: (deviceId) => sql.includes('FROM sync_group_members')
        ? [{ group_id: `group-for-${deviceId}`, timeline_id: 'timeline-1' }] : [],
      get: (value) => sql.includes('sqlite_master')
        ? ['sync_groups', 'sync_group_members'].includes(value) ? { present: 1 } : undefined
        : undefined
    }) };
    expect(inspectSyncGroupBinding(database, 'Xiaomi 23049RAD8C')).toEqual({
      group_id: 'group-for-Xiaomi 23049RAD8C', timeline_id: 'timeline-1'
    });
  });

  it('reports one stored legacy group without treating it as a local binding', () => {
    const database = { prepare: () => ({
      all: () => [{ group_id: 'group-1', timeline_id: 'timeline-1' }],
      get: () => ({ present: 1 })
    }) };
    expect(inspectStoredSyncGroup(database)).toEqual({
      group_id: 'group-1', timeline_id: 'timeline-1'
    });
  });
});
