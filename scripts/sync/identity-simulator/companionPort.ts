import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { DbPort, DbParams } from '../../../lib/core/sync/dbPort.js';

import { currentPeer } from './scope.js';

// Capacitor accepts numbered positional parameters; better-sqlite3 binds them by
// name. This host adapter preserves the same SQL/arguments without altering data.
export function companionPort(): DbPort {
  const port = createBetterSqliteDbPort(currentPeer().sqlite);
  const bind = (sql: string, params: DbParams = []) => {
    if (!/\?\d+/.test(sql)) return { sql, params };
    const positional: DbParams[number][] = [];
    const translated = sql.replace(/\?(\d+)/g, (_, number: string) => {
      positional.push(params[Number(number) - 1]!);
      return '?';
    });
    return { sql: translated, params: positional };
  };
  return { ...port,
    query: (sql, params) => { const bound = bind(sql, params); return port.query(bound.sql, bound.params); },
    run: (sql, params) => { const bound = bind(sql, params); return port.run(bound.sql, bound.params); }
  };
}
