import { AsyncLocalStorage } from 'node:async_hooks';

import type BetterSqlite3 from 'better-sqlite3';

type SqliteDatabase = BetterSqlite3.Database;
export type SqliteConnectionOwner = { readonly token: symbol };

interface WaitingOwner {
  owner: SqliteConnectionOwner;
  resume: () => void;
}

const coordinators = new WeakMap<SqliteDatabase, SqliteConnectionCoordinator>();

export class SqliteConnectionOwnerError extends Error {
  constructor(message = 'sqlite connection is owned by another asynchronous transaction') {
    super(message);
    this.name = 'SqliteConnectionOwnerError';
  }
}

export class SqliteConnectionCoordinator {
  private readonly ownerContext = new AsyncLocalStorage<SqliteConnectionOwner>();
  private readonly waitingOwners: WaitingOwner[] = [];
  private activeOwner: SqliteConnectionOwner | null = null;

  assertAccess() {
    if (this.activeOwner && this.ownerContext.getStore() !== this.activeOwner) {
      throw new SqliteConnectionOwnerError();
    }
  }

  assertCanClose() {
    if (this.activeOwner || this.waitingOwners.length > 0) {
      throw new SqliteConnectionOwnerError('cannot close sqlite connection while coordinated work is active');
    }
  }

  assertScopedOwner(owner: SqliteConnectionOwner, active: boolean) {
    if (!active || this.activeOwner !== owner || this.ownerContext.getStore() !== owner) {
      throw new SqliteConnectionOwnerError('sqlite transaction scope is no longer active');
    }
  }

  async runExclusive<T>(
    execute: (owner: SqliteConnectionOwner, nested: boolean) => Promise<T> | T
  ): Promise<T> {
    const currentOwner = this.ownerContext.getStore();
    if (currentOwner && currentOwner === this.activeOwner) {
      return await execute(currentOwner, true);
    }

    const owner: SqliteConnectionOwner = { token: Symbol('sqlite-owner') };
    const wait = this.acquire(owner);
    if (wait) await wait;
    try {
      return await this.ownerContext.run(owner, () => execute(owner, false));
    } finally {
      this.release(owner);
    }
  }

  private acquire(owner: SqliteConnectionOwner): Promise<void> | null {
    if (!this.activeOwner) {
      this.activeOwner = owner;
      return null;
    }
    return new Promise((resume) => {
      this.waitingOwners.push({ owner, resume });
    });
  }

  private release(owner: SqliteConnectionOwner) {
    if (this.activeOwner !== owner) {
      throw new SqliteConnectionOwnerError('sqlite transaction owner release mismatch');
    }
    const next = this.waitingOwners.shift();
    this.activeOwner = next?.owner ?? null;
    next?.resume();
  }
}

export function getSqliteConnectionCoordinator(sqlite: SqliteDatabase) {
  const existing = coordinators.get(sqlite);
  if (existing) return existing;
  const coordinator = new SqliteConnectionCoordinator();
  coordinators.set(sqlite, coordinator);
  return coordinator;
}

export function registerSqliteConnectionAlias(
  sqlite: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  coordinators.set(sqlite, coordinator);
}
