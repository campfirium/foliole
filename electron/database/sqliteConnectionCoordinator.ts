import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';

import type BetterSqlite3 from 'better-sqlite3';

type SqliteDatabase = BetterSqlite3.Database;
export type SqliteConnectionOwner = {
  readonly canClose: boolean;
  readonly token: symbol;
};

interface WaitingOwner {
  owner: SqliteConnectionOwner;
  resume: () => void;
}

const diagnosticChannel = channel('foliole.sqlite.coordinator');

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

  constructor(private readonly database = { name: 'unbound', readonly: false }) {}

  private trace(event: string, owner: SqliteConnectionOwner) {
    if (!diagnosticChannel.hasSubscribers) return;
    diagnosticChannel.publish({ event, coordinator: this, database: this.database, owner,
      active: this.activeOwner, waiting: this.waitingOwners.map(item => item.owner) });
  }

  assertAccess() {
    if (this.activeOwner && this.ownerContext.getStore() !== this.activeOwner) {
      throw new SqliteConnectionOwnerError();
    }
  }

  assertCanClose() {
    const currentOwner = this.ownerContext.getStore();
    if (this.activeOwner && currentOwner === this.activeOwner && currentOwner.canClose) {
      return;
    }
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
    return this.runOwned(false, execute);
  }

  async runMaintenance<T>(execute: () => Promise<T> | T): Promise<T> {
    return this.runOwned(true, () => execute());
  }

  private async runOwned<T>(
    canClose: boolean,
    execute: (owner: SqliteConnectionOwner, nested: boolean) => Promise<T> | T
  ): Promise<T> {
    const currentOwner = this.ownerContext.getStore();
    if (currentOwner && currentOwner === this.activeOwner) {
      if (canClose && !currentOwner.canClose) {
        throw new SqliteConnectionOwnerError('sqlite connection owner cannot enter maintenance');
      }
      return await execute(currentOwner, true);
    }

    const owner: SqliteConnectionOwner = { canClose, token: Symbol('sqlite-owner') };
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
      this.trace('acquired', owner);
      return null;
    }
    return new Promise((resume) => {
      this.waitingOwners.push({ owner, resume });
      this.trace('queued', owner);
    });
  }

  private release(owner: SqliteConnectionOwner) {
    if (this.activeOwner !== owner) {
      throw new SqliteConnectionOwnerError('sqlite transaction owner release mismatch');
    }
    const next = this.waitingOwners.shift();
    this.activeOwner = next?.owner ?? null;
    this.trace('released', owner);
    next?.resume();
  }
}

export function getSqliteConnectionCoordinator(sqlite: SqliteDatabase) {
  const existing = coordinators.get(sqlite);
  if (existing) return existing;
  const coordinator = new SqliteConnectionCoordinator({ name: sqlite.name, readonly: sqlite.readonly });
  coordinators.set(sqlite, coordinator);
  return coordinator;
}

export function registerSqliteConnectionAlias(
  sqlite: SqliteDatabase,
  coordinator: SqliteConnectionCoordinator
) {
  coordinators.set(sqlite, coordinator);
}
