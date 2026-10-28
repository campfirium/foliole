// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { act, assertDurable, exchange, node, now, open, persistence, publish, readView, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(async () => { vi.restoreAllMocks(); await closeLibraries(); });

it.each((['grade', 'read'] as const).flatMap(action => (['parent', 'self'] as const).map(removal => [action, removal] as const)))('does not repeat full planning for %s after remote %s removal of a minute item', async (action, removal) => {
  const [desktop, mobile] = await setupPeers();
  node(desktop, 'parent', 'folder');
  node(desktop, 'minute', 'item', 'parent');
  for (let i = 0; i < 12; i += 1) node(desktop, `item-${i}`, 'item');
  for (let i = 0; i < 4; i += 1) node(desktop, `topic-${i}`, 'topic');
  desktop.db.prepare("UPDATE nodes SET enable_short_term=1 WHERE id='minute'").run();
  publish(desktop, 'minute');
  await exchange(desktop, mobile);
  let local = (await openDailyFlow(mobile.port, { now, mode: 'recommended', preferredNodeId: 'minute' }, settings(mobile), persistence)).session;
  local = await act(mobile, local, 'grade');
  const minuteDue = (await snapshot(mobile)).nodesById.minute!.review!.due;
  expect(minuteDue).toBe('2026-10-26T08:10:00.000Z');
  const removed = removal === 'parent' ? 'parent' : 'minute';
  softDeleteNodes(desktop.driver, { nodeIds: [removed], deletedAt: '2026-10-26T08:02:00.000Z' });
  publish(desktop, removed, '2026-10-26T08:02:00.000Z');
  await exchange(desktop, mobile);
  local = await open(mobile, minuteDue, settings(mobile), action === 'read' ? 'reading-only' : 'recommended');
  expect(local.queueNodeIds).not.toContain('minute');
  const reads = vi.spyOn(persistence, 'learningSnapshot');
  for (let i = 0; i < 2; i += 1) {
    const next = (await readView(mobile, minuteDue, action === 'read' ? 'reading-only' : 'recommended'))[1];
    reads.mockClear();
    local = await act(mobile, local, action, minuteDue);
    expect(local.currentNodeId).toBe(next);
    expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  }
  await assertDurable(mobile, local);
});

it('still admits a valid minute item alongside a retired entry, then returns to scoped grading', async () => {
  const [desktop, mobile] = await setupPeers();
  for (let i = 0; i < 12; i += 1) node(desktop, `item-${i}`, 'item');
  for (const id of ['retired', 'waiting']) {
    node(desktop, id, 'item');
    desktop.db.prepare('UPDATE nodes SET enable_short_term=1 WHERE id=?').run(id);
    publish(desktop, id);
  }
  await exchange(desktop, mobile);
  let local = await open(mobile);
  for (const id of ['retired', 'waiting']) {
    local = (await openDailyFlow(mobile.port, { now, mode: 'recommended', preferredNodeId: id }, settings(mobile), persistence)).session;
    local = await act(mobile, local, 'grade');
  }
  softDeleteNodes(desktop.driver, { nodeIds: ['retired'], deletedAt: '2026-10-26T08:02:00.000Z' });
  publish(desktop, 'retired', '2026-10-26T08:02:00.000Z');
  await exchange(desktop, mobile);
  local = await open(mobile);
  const reads = vi.spyOn(persistence, 'learningSnapshot');
  local = await act(mobile, local, 'grade', '2026-10-26T08:10:00.000Z');
  expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  for (let step = 0; step < 15 && local.currentNodeId !== 'waiting'; step++) {
    reads.mockClear();
    local = await act(mobile, local, 'grade', '2026-10-26T08:10:00.000Z');
    expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  }
  expect(local.currentNodeId).toBe('waiting');
  expect(local.queueNodeIds).not.toContain('retired');
  expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  reads.mockClear();
  local = await act(mobile, local, 'grade', '2026-10-26T08:10:00.000Z');
  expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  await assertDurable(mobile, local);
});

it('reconciles a changed mix once without restarting completed progress or repeatedly loading the library', async () => {
  const [desktop, mobile] = await setupPeers();
  for (let i = 0; i < 12; i += 1) node(desktop, `item-${i}`, 'item');
  for (let i = 0; i < 3; i += 1) node(desktop, `topic-${i}`, 'topic');
  await exchange(desktop, mobile);
  let local = await open(mobile);
  const completed = local.currentNodeId!;
  local = await act(mobile, local, 'grade');
  local = await act(mobile, local, 'grade');
  const before = structuredClone(local);
  const changed = { ...settings(mobile), pushQueue: { ...settings(mobile).pushQueue, queueMixRatio: { fsrs: 1, reading: 1 } } };
  const reads = vi.spyOn(persistence, 'learningSnapshot');
  local = await open(mobile, now, changed);
  expect(reads.mock.calls.some(call => call[1] === undefined)).toBe(true);
  expect(local.queueNodeIds.slice(0, before.queueNodeIds.length)).toEqual(before.queueNodeIds);
  expect(local.queueNodeIds).not.toContain(completed);
  expect(local.currentNodeId).toBe(before.currentNodeId);
  expect(local.reviewedItemCount).toBe(before.reviewedItemCount);
  const storedSettings = JSON.parse((mobile.db.prepare('SELECT settings_key FROM daily_flow_state').get() as { settings_key: string }).settings_key);
  expect(storedSettings).toMatchObject(changed);
  expect(storedSettings.dayWindow).toEqual(local.dayWindow);
  reads.mockClear();
  expect(await open(mobile, now, changed)).toEqual(local);
  expect(reads.mock.calls.every(call => call[1] !== undefined)).toBe(true);
  reads.mockClear();
  local = await act(mobile, local, 'grade', now, changed);
  expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  expect(local.queueNodeIds.slice(0, before.queueNodeIds.length - 1)).toEqual(before.queueNodeIds.slice(1));
  await assertDurable(mobile, local);
});

it('keeps reading-only actions local while a valid minute review waits for the next review entry', async () => {
  const [desktop, mobile] = await setupPeers();
  node(desktop, 'minute', 'item');
  for (let i = 0; i < 4; i += 1) node(desktop, `topic-${i}`, 'topic');
  desktop.db.prepare("UPDATE nodes SET enable_short_term=1 WHERE id='minute'").run();
  publish(desktop, 'minute');
  await exchange(desktop, mobile);
  let local = await open(mobile);
  expect(local.currentNodeId).toBe('minute');
  local = await act(mobile, local, 'grade');
  local = await open(mobile, now, settings(mobile), 'reading-only');
  const reads = vi.spyOn(persistence, 'learningSnapshot');
  for (let i = 0; i < 2; i += 1) {
    reads.mockClear();
    local = await act(mobile, local, 'read', '2026-10-26T08:10:00.000Z');
    expect(local.queueNodeIds).not.toContain('minute');
    expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  }
  await assertDurable(mobile, local);
  local = await open(mobile, '2026-10-26T08:10:00.000Z');
  local = (await openDailyFlow(mobile.port, { now: '2026-10-26T08:10:00.000Z', mode: 'review-first' }, settings(mobile), persistence)).session;
  expect(local.currentNodeId).toBe('minute');
  await assertDurable(mobile, local);
});
