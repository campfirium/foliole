import type BetterSqlite3 from 'better-sqlite3';

import {
  getSqliteConnectionCoordinator,
  registerSqliteConnectionAlias,
  type SqliteConnectionCoordinator
} from './sqliteConnectionCoordinator.js';

type SqliteDatabase = BetterSqlite3.Database;
type SqliteStatement = BetterSqlite3.Statement<unknown[]>;
type Callable = (...args: unknown[]) => unknown;

const guardedDatabases = new WeakMap<SqliteDatabase, SqliteDatabase>();

export function guardBetterSqliteDatabase(raw: SqliteDatabase): SqliteDatabase {
  const existing = guardedDatabases.get(raw);
  if (existing) return existing;
  const coordinator = getSqliteConnectionCoordinator(raw);
  let guarded!: SqliteDatabase;
  guarded = new Proxy(raw, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      const method = value as Callable;
      if (property === 'prepare') return guardPrepare(method, target, guarded, coordinator);
      if (property === 'transaction') return guardTransactionFactory(method, target, coordinator);
      if (property === 'backup') return guardAsyncDatabaseMethod(method, target, coordinator);
      if (property === 'close') return guardClose(method, target, guarded, coordinator);
      return guardDatabaseMethod(method, target, guarded, coordinator);
    }
  }) as SqliteDatabase;
  guardedDatabases.set(raw, guarded);
  registerSqliteConnectionAlias(guarded, coordinator);
  return guarded;
}

function guardPrepare(
  prepare: Callable,
  raw: SqliteDatabase,
  guarded: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  return (...args: unknown[]) => {
    coordinator.assertAccess();
    const statement = Reflect.apply(prepare, raw, args) as SqliteStatement;
    return guardStatement(statement, guarded, coordinator);
  };
}

function guardStatement(
  raw: SqliteStatement,
  guardedDatabase: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  const guarded: SqliteStatement = {
    get busy() { return raw.busy; },
    get database() { return guardedDatabase; },
    get reader() { return raw.reader; },
    get readonly() { return raw.readonly; },
    get source() { return raw.source; },
    all(...params) {
      coordinator.assertAccess();
      return raw.all(...params);
    },
    bind(...params) {
      coordinator.assertAccess();
      raw.bind(...params);
      return guarded;
    },
    columns() {
      coordinator.assertAccess();
      return raw.columns();
    },
    expand(toggleState) {
      return configureStatement(raw, 'expand', toggleState, guarded, coordinator);
    },
    get(...params) {
      coordinator.assertAccess();
      return raw.get(...params);
    },
    iterate(...params) {
      coordinator.assertAccess();
      return guardIterator(raw.iterate(...params), coordinator);
    },
    pluck(toggleState) {
      return configureStatement(raw, 'pluck', toggleState, guarded, coordinator);
    },
    raw(toggleState) {
      return configureStatement(raw, 'raw', toggleState, guarded, coordinator);
    },
    run(...params) {
      coordinator.assertAccess();
      return raw.run(...params);
    },
    safeIntegers(toggleState) {
      return configureStatement(raw, 'safeIntegers', toggleState, guarded, coordinator);
    }
  };
  return guarded;
}

function configureStatement(
  raw: SqliteStatement,
  method: 'expand' | 'pluck' | 'raw' | 'safeIntegers',
  toggleState: boolean | undefined,
  guarded: SqliteStatement,
  coordinator: SqliteConnectionCoordinator
) {
  coordinator.assertAccess();
  if (toggleState === undefined) raw[method]();
  else raw[method](toggleState);
  return guarded;
}

function guardIterator(iterator: IterableIterator<unknown>, coordinator: SqliteConnectionCoordinator) {
  let guarded!: IterableIterator<unknown>;
  guarded = new Proxy(iterator, {
    get(target, property) {
      if (property === Symbol.iterator) return () => guarded;
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        coordinator.assertAccess();
        return Reflect.apply(value, target, args) as unknown;
      };
    }
  });
  return guarded;
}

function guardTransactionFactory(
  transaction: Callable,
  raw: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  return (...args: unknown[]) => {
    coordinator.assertAccess();
    const wrapped = Reflect.apply(transaction, raw, args) as Callable;
    return guardCallable(wrapped, coordinator);
  };
}

function guardCallable(target: Callable, coordinator: SqliteConnectionCoordinator): Callable {
  return new Proxy(target, {
    apply(callable, thisArg, args) {
      coordinator.assertAccess();
      return Reflect.apply(callable, thisArg, args) as unknown;
    },
    get(callable, property) {
      const value = Reflect.get(callable, property, callable) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        coordinator.assertAccess();
        return Reflect.apply(value, callable, args) as unknown;
      };
    }
  });
}

function guardAsyncDatabaseMethod(
  method: Callable,
  raw: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  return (...args: unknown[]) => coordinator.runExclusive(
    () => Reflect.apply(method, raw, args) as Promise<unknown>
  );
}

function guardDatabaseMethod(
  method: Callable,
  raw: SqliteDatabase,
  guarded: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  return (...args: unknown[]) => {
    coordinator.assertAccess();
    const result = Reflect.apply(method, raw, args) as unknown;
    return result === raw ? guarded : result;
  };
}

function guardClose(
  close: Callable,
  raw: SqliteDatabase,
  guarded: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  return (...args: unknown[]) => {
    coordinator.assertCanClose();
    Reflect.apply(close, raw, args);
    return guarded;
  };
}
