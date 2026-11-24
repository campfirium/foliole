import * as specialNodeIds from '../../../../../lib/core/database/specialNodeIds';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import {
  getMobileGuidedSampleContent,
  GUIDED_SAMPLE_PRIORITY,
  type GuidedSampleTopicTemplate
} from '../../../../../lib/core/guidedSample/guidedSampleContent';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { resolveGuidedSampleLocale, type GuidedSampleLocale } from '../../../../features/guidedSample/model/guidedSampleLocale';
import { deriveNodeTitleFromContent } from '../../../../features/nodes/model/deriveNodeTitle';
import { createCompanionUuid } from '../../companionUuid';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb } from './companionNodeHistory';
import { readIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

const SPECIAL_IDS: string[] = Object.values(specialNodeIds);

/**
 * A phone library is offered the sample only while it holds nothing of the user's own and has not joined a sync group:
 * a library that joins later keeps the sample like any other topic, and a phone that joins first never writes one.
 */
async function needsGuidedSample(db: DbPort) {
  const placeholders = SPECIAL_IDS.map(() => '?').join(', ');
  const [node] = await db.query(`SELECT 1 FROM nodes WHERE id NOT IN (${placeholders}) LIMIT 1`, SPECIAL_IDS);
  if (node) return false;
  const [group] = await db.query('SELECT 1 FROM sync_group_local_state LIMIT 1');
  return !group;
}

function sampleNode(topic: GuidedSampleTopicTemplate, parentNodeId: string, timestamp: string): WorkspaceNodeSnapshot {
  const title = deriveNodeTitleFromContent(topic.content);
  return {
    anchorLink: null, content: topic.content, createdAt: timestamp, hideTitleHeading: false,
    id: `node-${createCompanionUuid()}`, isTitleManual: false, kind: 'topic',
    openingText: resolveNodeOpeningText(topic.content, title), parentNodeId, priority: GUIDED_SAMPLE_PRIORITY,
    reading: null, reveal: null, review: null, title, updatedAt: timestamp
  };
}

/** `now` is the newest creation time: a topic is due from its creation, so a Flow opened at `now` holds the whole sample. */
export function buildCompanionGuidedSampleNodes(locale: GuidedSampleLocale, now = Date.now()) {
  const content = getMobileGuidedSampleContent(locale);
  const topics = [content.root, ...content.children];
  const nodes: WorkspaceNodeSnapshot[] = [];
  topics.forEach((topic, index) => {
    // Distinct creation times keep the sample's sibling order stable wherever it syncs.
    const createdAt = new Date(now - (topics.length - 1 - index)).toISOString();
    nodes.push(sampleNode(topic, nodes[0]?.id ?? specialNodeIds.INBOX_NODE_ID, createdAt));
  });
  return nodes;
}

async function writeGuidedSample(db: DbPort, locale: GuidedSampleLocale, now: number) {
  if (!await needsGuidedSample(db)) return [];
  const nodes = buildCompanionGuidedSampleNodes(locale, now);
  const host = await iosCompanionHostName(db);
  const records = await Promise.all(nodes.map(node =>
    toWorkspaceNativeNodeVersion(node, host, createOpaqueVersionRef(createCompanionUuid()))));
  await commitCompanionNodeHistoryWithDb(db, records, 'Create guided sample', 'local_mutation', nodes.map(node => node.id));
  return nodes.map(node => node.id);
}

const settledOwners = new WeakSet<object>();

/** True once this library's sample question is answered, so a Flow open can skip the check without yielding. */
export function isCompanionGuidedSampleSettled() {
  try { return settledOwners.has(getIosCompanionDatabaseOwner()); }
  catch { return false; }
}

/**
 * Writes the phone's guided sample before Flow opens on an untouched library, so Flow starts with it.
 * `now` is the time that Flow opens at; the sample is stamped no later, or the open would find none of it due yet.
 */
export async function ensureCompanionGuidedSample(now = Date.now(), locale: GuidedSampleLocale = resolveGuidedSampleLocale()) {
  const owner = getIosCompanionDatabaseOwner();
  if (settledOwners.has(owner)) return [];
  if (!await readIosCompanionDatabase(needsGuidedSample)) {
    settledOwners.add(owner);
    return [];
  }
  let created: string[] = [];
  await runCompanionHistoryMutation(async db => (created = await writeGuidedSample(db, locale, now)),
    ids => ({ kind: 'nodes', nodeIds: ids, structure: true, metadata: true }));
  settledOwners.add(owner);
  return created;
}
