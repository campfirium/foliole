// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../../../../lib/core/review/settings';
import { flushCurrentParentOrderProjectionsWithDbPort } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';
import { companionDailyFlowPersistence } from '../runtime/companionDailyFlow';

import { readCompanionContentSource, saveCompanionContentEdit } from './companionContentEditing';
import { insertContentEditNode, openContentEditDatabase } from './companionContentEditing.testSupport';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null, platform: 'ios' }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => state.platform, isNativePlatform: () => true
}, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));

it.each(['android', 'ios'])('%s content save through the owner preserves its generated sequence and reading facts', async platform => {
  state.platform = platform;
  const now = '2026-10-26T08:00:00.000Z';
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliole-body-flow-'));
  const host = await openContentEditDatabase(directory, now);
  state.owner = host.owner;
  try {
    for (const id of ['a', 'b']) await insertContentEditNode(host.owner, {
      id, kind: 'topic', title: id, content: `Body ${id}`, isTitleManual: true, hideTitleHeading: false,
      parentNodeId: null, reveal: null, anchorLink: null, reading: null, review: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now
    }, `base-${id}`);
    const config = { scope: directory, newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
    const opened = await host.owner.runWriter(db => openDailyFlow(db, { now, mode: 'reading-only' }, config, companionDailyFlowPersistence));
    const id = opened.session.currentNodeId!;
    const before = await host.owner.read(db => readCycleRows(db));
    await host.owner.runWriter(db => flushCurrentParentOrderProjectionsWithDbPort(db));
    const source = await readCompanionContentSource(id, 'editor');
    const readings = host.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
    const result = await saveCompanionContentEdit({ nodeId: id, baseVersionId: source.versionId,
      versionId: 'body-edit', content: 'Edited on the companion', updatedAt: now });
    expect(result.content).toBe('Edited on the companion');
    expect(host.database.prepare('SELECT content FROM nodes WHERE id=?').pluck().get(id)).toBe(result.content);
    expect(host.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(readings);
    expect(host.database.prepare('SELECT * FROM parent_order_projection_pending').all()).toEqual([]);
    expect((await host.owner.read(db => readDailyFlow(db)))!.invalidated).toBe(0);
    expect(await host.owner.read(db => readCycleRows(db))).toEqual(before);
  } finally {
    await host.owner.close(); state.owner = null;
    host.database.close(); rmSync(directory, { recursive: true, force: true });
  }
});
