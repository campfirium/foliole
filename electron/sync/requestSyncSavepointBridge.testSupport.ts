import { expect, vi } from 'vitest';

import { createCapacitorSqliteDbPort } from '../../src/shared/platform/capacitorSqliteDbPort.js';
import { createFakeCapacitorConnection } from '../../src/shared/platform/companionSyncNodeVersionsTestSupport.js';

import type { Peer } from './requestSyncDatabaseHttp.testSupport.js';

export function observeSavepointBridge(receiver: Peer, failHandoff = false) {
  const controls: string[][] = [];
  const control = (sql: string) => /^(SAVEPOINT|RELEASE|ROLLBACK) (?:TO )?request_sync_object$/u
    .exec(sql.replace(/^\/\* savepoint rollback \*\/ /u, ''))?.[1];
  const applied = vi.fn<(object: { globalId: string }) => void>();
  const notifications = { objectApplied: applied };
  const host = receiver.host;
  const spy = vi.spyOn(receiver, 'host', 'get').mockReturnValue({
    ...host,
    write: async write => {
      const connection = createFakeCapacitorConnection(receiver.sqlite);
      const { run, executeSet } = connection;
      connection.run = (sql, params) => {
        const operation = control(sql);
        if (operation) controls.push([operation]);
        return run(sql, params);
      };
      connection.executeSet = async (set, transaction) => {
        const operations = set.flatMap(({ statement }) => control(statement) ?? []);
        if (operations.length) {
          expect(transaction).toBe(false);
          expect(receiver.sqlite.inTransaction).toBe(true);
          controls.push(operations);
          if (failHandoff) {
            failHandoff = false;
            await executeSet(set.slice(0, 1), transaction);
            throw new Error('savepoint open failed');
          }
        }
        return executeSet(set, transaction);
      };
      return write(createCapacitorSqliteDbPort(connection as never, 'android'));
    },
    ...notifications
  });
  return { controls, applied, restore: () => spy.mockRestore() };
}
