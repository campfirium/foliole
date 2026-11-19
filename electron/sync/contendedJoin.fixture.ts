import { channel } from 'node:diagnostics_channel';

import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

export async function postJoinDuringTransaction(origin: string, input: unknown) {
  const diagnostics = channel('foliole.sqlite.coordinator');
  const entered = deferred();
  const release = deferred();
  const queued = deferred();
  const observe = (message: unknown) => {
    if ((message as { event: string }).event === 'queued') queued.resolve();
  };
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const transaction = db.transaction(async () => {
    entered.resolve();
    await release.promise;
  });
  await Promise.race([entered.promise, transaction]);
  diagnostics.subscribe(observe);
  const response = fetch(`${origin}/sync-group/join-requests`, {
    method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000)
  });
  try {
    await Promise.race([queued.promise, response]);
  } finally {
    diagnostics.unsubscribe(observe);
    release.resolve();
    await transaction;
  }
  const result = await response;
  return { status: result.status, body: await result.json() as unknown };
}

export async function completeJoinAcrossTransactionHandoff(complete: () => Promise<unknown>) {
  const entered = deferred();
  const release = deferred();
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const first = db.transaction(async () => {
    entered.resolve();
    await release.promise;
  });
  await Promise.race([entered.promise, first]);
  const completion = complete();
  const next = db.transaction(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  release.resolve();
  try { return await completion; }
  finally { await Promise.all([first, next]); }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}
