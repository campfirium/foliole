import { expect } from 'vitest';

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import type { DailyFlowResult } from '../../lib/core/flow/dailyFlowContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openDatabaseConnection } from '../database/connection.js';

import { body, create, database, gradeArgs, run, snapshotArgs, stamp } from './actionCostLibrary.testSupport.js';

// Everyday actions measured by the cost check. Every scenario asserts that the action did something.

export type Measure = <T>(name: string, command: string, args: Record<string, unknown>) => Promise<T>;

const NOW = '2026-10-28T08:00:00.000Z';
const READING = { intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: NOW,
  nextAt: '2026-10-29T08:00:00.000Z', priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' };
const openArgs = (extra: Record<string, unknown> = {}) => ({ now: NOW, mode: 'reading-only', ...extra });

/** Open, read the current Topic, undo and redo it, either globally or inside a Dive. */
async function flowRound(measure: Measure, label: 'flow' | 'dive', extra: Record<string, unknown> = {}) {
  const commit = async (name: string, args: Record<string, unknown>) =>
    (await measure<DailyFlowResult>(`${label} ${name}`, NATIVE_COMMANDS.commitDailyFlow, { now: NOW, ...args })).session;
  const open = label === 'flow' ? 'flow open (same day)' : 'dive open';
  const opened = (await measure<DailyFlowResult>(open, NATIVE_COMMANDS.openDailyFlow, openArgs(extra))).session;
  const nodeId = opened.currentNodeId!;
  expect(nodeId).toBeTruthy();
  const opId = `read-${label}`;
  const forward = [{ nodeId, before: null, after: READING }];
  const read = await commit('next page', { opId, token: opened.daily, sourceSession: opened, readingAction: 'read', readings: forward });
  expect(read.currentNodeId).not.toBe(nodeId);
  const undo = await commit('undo', { opId: `undo-${label}`, token: read.daily, historyMode: 'undo', historyTargetOpId: opId,
    sourceSession: read, historySourceSession: read, nextSession: opened, readings: [{ nodeId, before: READING, after: null }] });
  expect(undo.currentNodeId).toBe(nodeId);
  const redo = await commit('redo', { opId: `redo-${label}`, token: undo.daily, historyMode: 'redo', historyTargetOpId: opId,
    sourceSession: undo, historySourceSession: opened, nextSession: read, readings: forward });
  expect(redo.currentNodeId).toBe(read.currentNodeId);
}

async function flowActions(measure: Measure) {
  await run(NATIVE_COMMANDS.openDailyFlow, openArgs());
  await flowRound(measure, 'flow');
  // Dive over the Topics last in the daily list, so everything untouched sits in front of them.
  const order = database().prepare('SELECT node_id FROM daily_flow_entries WHERE active=1 ORDER BY order_key')
    .pluck().all() as string[];
  const members = order.slice(-20);
  const dive = await run<{ id: string }>(NATIVE_COMMANDS.createDive, { title: 'Cost dive', sourceIds: members });
  await flowRound(measure, 'dive', { dive: { id: dive.id, topicIds: members } });
}

function moveArgs() {
  const driver = openDatabaseConnection().driver;
  const from = readMoveParentOrder(driver, 'work').visibleIds;
  const to = readMoveParentOrder(driver, 'work-other').visibleIds;
  return { nodes: [{ nodeId: 'work-3', expectedParentNodeId: 'work', parentNodeId: 'work-other', updatedAt: stamp() }],
    parentOrders: [{ parentNodeId: 'work', expectedChildIds: from, childIds: from.filter(id => id !== 'work-3') },
      { parentNodeId: 'work-other', expectedChildIds: to, childIds: [...to, 'work-3'] }],
    maintainSequentialReading: false, defaultPriority: 5 };
}

async function nodeActions(measure: Measure) {
  const count = () => database().prepare('SELECT COUNT(*) FROM nodes').pluck().get() as number;
  const before = count();
  await create(NATIVE_COMMANDS.createTopic, 'work-seed', 'work', 'topic');
  const at = stamp();
  await measure('create topic', NATIVE_COMMANDS.createTopic, { anchorLink: null, content: body('work-new'), createdAt: at,
    isTitleManual: true, kind: 'topic', nodeId: 'work-new', parentNodeId: 'work', position: 9, reveal: null,
    title: 'work-new', updatedAt: at });
  expect(count()).toBe(before + 2);
  await measure('rename', NATIVE_COMMANDS.updateNodeContent, snapshotArgs('work-1', { title: 'Renamed' }));
  const baseVersionId = String(database().prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('work-2'));
  await measure('body save', NATIVE_COMMANDS.updateNodeContentWithAnchors, {
    parent: snapshotArgs('work-2', { content: `Edited. ${body('work-2')}` }), affectedAnchors: [],
    edit: { baseVersionId, versionId: 'ver-cost-edit' } });
  await measure('move', NATIVE_COMMANDS.moveNodes, moveArgs());
  await measure('move to Trash', NATIVE_COMMANDS.softDeleteNodes, { nodeIds: ['work-4'], deletedAt: stamp() });
  await measure('restore', NATIVE_COMMANDS.restoreNodes, { nodeIds: ['work-4'] });
  await measure('grade', NATIVE_COMMANDS.applyReviewGrade, gradeArgs('work-item'));
}

export async function runActions(measure: Measure) {
  await flowActions(measure);
  await nodeActions(measure);
  await measure('flow open (after edits)', NATIVE_COMMANDS.openDailyFlow, openArgs());
}
