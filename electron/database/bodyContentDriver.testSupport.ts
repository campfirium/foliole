import { expect } from 'vitest';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export function observeDriver(driver: DatabaseDriver) {
  const sizes: number[] = [];
  const inspect = <T extends DatabaseRow>(rows: T[]) => {
    for (const row of rows) for (const value of Object.values(row)) {
      const size = typeof value === 'string' ? Buffer.byteLength(value)
        : value instanceof Uint8Array ? value.byteLength : 0;
      expect(size).toBeLessThanOrEqual(512 * 1024);
      if (value instanceof Uint8Array) sizes.push(size);
    }
    return rows;
  };
  const bounded: DatabaseDriver = { ...driver,
    queryOne: <T extends DatabaseRow>(sql: string, params?: Parameters<DatabaseDriver['queryOne']>[1]) => {
      const row = driver.queryOne<T>(sql, params);
      return row ? inspect([row])[0] : undefined;
    },
    queryAll: <T extends DatabaseRow>(sql: string, params?: Parameters<DatabaseDriver['queryAll']>[1]) =>
      inspect(driver.queryAll<T>(sql, params)),
    transaction: (run) => driver.transaction(() => run(bounded))
  };
  return { driver: bounded, sizes };
}
