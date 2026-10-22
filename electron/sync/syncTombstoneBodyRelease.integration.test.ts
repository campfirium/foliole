// @vitest-environment node
import { expect, it } from 'vitest';

import { deletePermanently, groupRound, nodeTraces, retireThirdMember, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

const NODE = 'forget-me';
const SECRET = 'T384 private paragraph 9c1e';

/** Every table cell, text or bytes, that still holds the deleted note's words. */
function tablesHolding(databasePath: string, needle: string) {
  return withDb(databasePath, db => {
    const holders: string[] = [];
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .pluck().all() as string[];
    for (const table of tables) {
      for (const column of db.prepare(`SELECT name FROM pragma_table_info(?)`).pluck().all(table) as string[]) {
        const found = db.prepare(`SELECT 1 FROM "${table}" WHERE instr(CAST("${column}" AS BLOB), CAST(? AS BLOB)) > 0 LIMIT 1`)
          .get(needle);
        if (found) holders.push(`${table}.${column}`);
      }
    }
    return holders;
  });
}

it('removes a permanently deleted note’s text from every device while keeping the deletion', { meta: { calibratedMs: 90_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) retireThirdMember(path, started.snapshot.deviceId);
  await fixture.left.seed({ content: `First draft. ${SECRET}`, nodeId: NODE, title: 'Forget me' });
  await fixture.left.seed({ content: `Second draft. ${SECRET}`, nodeId: NODE, title: 'Forget me' });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(tablesHolding(fixture.rightSnapshot.databasePath, SECRET)).not.toEqual([]);

  deletePermanently(fixture.leftSnapshot.databasePath, NODE, new Date().toISOString());
  expect(tablesHolding(fixture.leftSnapshot.databasePath, SECRET)).toEqual([]);

  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(tablesHolding(path, SECRET)).toEqual([]);
    expect(nodeTraces(path, NODE)).toMatchObject({ node: 0, tombstone: 1 });
  }
  expect(await groupRound(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(tablesHolding(path, SECRET)).toEqual([]);
    expect(nodeTraces(path, NODE)).toMatchObject({ node: 0, tombstone: 1 });
  }
}));
