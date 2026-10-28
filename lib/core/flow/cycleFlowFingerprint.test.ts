import { expect, it } from 'vitest';

import { hashTextBody } from '../database/textBodyHash.js';

import { changeCycleHash } from './cycleFlowFingerprint.js';
import { EMPTY_CYCLE_HASH, type CycleRow } from './cycleFlowTypes.js';

// Independent oracle for the existing persisted SHA-256 / XOR format.
function legacyHash(hash: string, before: CycleRow[], after: CycleRow[]) {
  const parts = [hash, ...before.map(rowHash), ...after.map(rowHash)];
  let result = '';
  for (let index = 0; index < 64; index += 2) {
    result += parts.reduce((sum, part) => sum ^ Number.parseInt(part.slice(index, index + 2), 16), 0)
      .toString(16).padStart(2, '0');
  }
  return result;
}

function rowHash(row: CycleRow) {
  return row.active ? hashTextBody(JSON.stringify([
    row.node_id, row.order_key, row.cohort, row.initial_task, row.handled
  ])) : EMPTY_CYCLE_HASH;
}

function rows(count: number): CycleRow[] {
  return Array.from({ length: count }, (_, index) => ({
    node_id: `source-资料-😀-\ud800-${index}`, order_key: index + 1,
    active: index % 7 ? 1 : 0, cohort: (['queue', 'soon', 'none'] as const)[index % 3]!,
    initial_task: index % 2 ? 1 : 0, handled: index % 5 ? 0 : 1
  }));
}

it('preserves the persisted fingerprint for empty and large initial daily lists', () => {
  expect(changeCycleHash(EMPTY_CYCLE_HASH, [], [])).toBe(EMPTY_CYCLE_HASH);
  const input = rows(14234);
  expect(changeCycleHash(EMPTY_CYCLE_HASH, [], input)).toBe(legacyHash(EMPTY_CYCLE_HASH, [], input));
});

it('preserves replacement, removal, reactivation and undo across existing fingerprints', () => {
  const initial = rows(24);
  const source = legacyHash(EMPTY_CYCLE_HASH, [], initial);
  const before = initial.slice(0, 12);
  const after: CycleRow[] = before.map((row, index) => ({ ...row,
    order_key: Number.MAX_SAFE_INTEGER - index, active: (row.active ? 0 : 1) as 0 | 1,
    handled: 1 as const, initial_task: 0 as const }));
  after.push(...rows(4).map(row => ({ ...row, node_id: `new-${row.node_id}` })));
  const changed = changeCycleHash(source, before, after);
  expect(changed).toBe(legacyHash(source, before, after));
  expect(changeCycleHash(changed, after, before)).toBe(source);
  expect(changeCycleHash(source, initial, [])).toBe(EMPTY_CYCLE_HASH);
  expect(changeCycleHash(source, before, after)).toBe(changeCycleHash(source, [...before].reverse(), [...after].reverse()));
});
