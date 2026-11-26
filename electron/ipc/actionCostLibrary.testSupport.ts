import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard, mapGradeToRustRating } from '../../lib/core/review/types.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openDatabaseConnection } from '../database/connection.js';
import { flushCoalescedWorkspaceSearchInvalidations } from '../database/searchIndexInvalidationCoalescer.js';

import { handleStorageCommand } from './storageCommands.js';

// Sample library for the action cost check, built only through product commands. The fixed work area is what the
// actions touch; `padding` adds content they never touch, so any growth between two sizes is amplification.

const AT = '2026-10-19T00:00:00.000Z';
let tick = 0;
const positions = new Map<string | null, number>();

export const stamp = () => new Date(Date.parse(AT) + ++tick * 1000).toISOString();
export const run = <T = unknown>(command: string, args: Record<string, unknown> = {}) =>
  handleStorageCommand(command, args) as Promise<T>;
export const database = () => openDatabaseConnection().sqlite;
export const body = (id: string) => `# ${id}\n\nBody of ${id} with a Target sentence.`;

/** Finish the work a command leaves behind, so it is not measured against the next action. */
export async function drain() {
  await flushCoalescedWorkspaceSearchInvalidations();
  await run(NATIVE_COMMANDS.flushDirtyNodeSyncVersions);
}

export async function create(command: string, nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic' | 'item') {
  const position = positions.get(parentNodeId) ?? 0;
  positions.set(parentNodeId, position + 1);
  const at = stamp();
  await run(command, { anchorLink: null, content: kind === 'folder' ? '' : body(nodeId), createdAt: at, isTitleManual: true,
    kind, nodeId, parentNodeId, position, reveal: kind === 'item' ? 'Answer' : null, title: nodeId, updatedAt: at });
}

export function snapshotArgs(nodeId: string, patch: Record<string, unknown> = {}) {
  const row = database().prepare('SELECT parent_id, position FROM nodes WHERE id = ?').get(nodeId) as
    { parent_id: string | null; position: number };
  return { content: body(nodeId), createdAt: AT, isTitleManual: true, kind: 'topic', nodeId, parentNodeId: row.parent_id,
    position: row.position, reveal: null, title: nodeId, updatedAt: stamp(), ...patch };
}

export function gradeArgs(nodeId: string) {
  const reviewedAt = stamp();
  const cardBefore = createInitialSchedulerCard(reviewedAt);
  const cardAfter = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters })
    .grade({ card: cardBefore, rating: mapGradeToRustRating(3), now: reviewedAt }).card;
  return { nodeId, opId: `grade-${tick}`, grade: 3, reviewedAt,
    schedulerVersion: getReviewSchedulerVersion(DEFAULT_REVIEW_SCHEDULER_SETTINGS), cardBefore, cardAfter };
}

async function createPadding(index: number) {
  const folder = `filler-folder-${Math.floor(index / 50)}`;
  if (index % 50 === 0) await create(NATIVE_COMMANDS.createFolder, folder, null, 'folder');
  await create(NATIVE_COMMANDS.createTopic, `filler-${index}`, folder, 'topic');
  if (index % 10 === 1) {
    await create(NATIVE_COMMANDS.createItem, `filler-item-${index}`, `filler-${index}`, 'item');
    await run(NATIVE_COMMANDS.applyReviewGrade, gradeArgs(`filler-item-${index}`));
  }
  if (index % 20 === 3) await run(NATIVE_COMMANDS.softDeleteNodes, { nodeIds: [`filler-${index}`], deletedAt: stamp() });
}

export async function buildLibrary(padding: number) {
  positions.clear();
  tick = 0;
  await create(NATIVE_COMMANDS.createFolder, 'work', null, 'folder');
  await create(NATIVE_COMMANDS.createFolder, 'work-other', null, 'folder');
  for (let index = 0; index < 8; index++) await create(NATIVE_COMMANDS.createTopic, `work-${index}`, 'work', 'topic');
  await create(NATIVE_COMMANDS.createItem, 'work-item', 'work-0', 'item');
  for (let index = 0; index < padding; index++) await createPadding(index);
  await drain();
}
