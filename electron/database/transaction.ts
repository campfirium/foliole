import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function withTransaction<T>(driver: DatabaseDriver, execute: () => T): T {
  return driver.transaction(() => execute());
}
