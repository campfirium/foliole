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

export function buildCompanionGuidedSampleNodes(locale: GuidedSampleLocale, now = Date.now()) {
  const content = getMobileGuidedSampleContent(locale);
  const nodes: WorkspaceNodeSnapshot[] = [];
  [content.root, ...content.children].forEach((topic, index) => {
    // Distinct creation times keep the sample's sibling order stable wherever it syncs.
    nodes.push(sampleNode(topic, nodes[0]?.id ?? specialNodeIds.INBOX_NODE_ID, new Date(now + index).toISOString()));
  });
  return nodes;
}

async function writeGuidedSample(db: DbPort, locale: GuidedSampleLocale) {
  if (!await needsGuidedSample(db)) return [];
  const nodes = buildCompanionGuidedSampleNodes(locale);
  const host = await iosCompanionHostName(db);
  const records = await Promise.all(nodes.map(node =>
    toWorkspaceNativeNodeVersion(node, host, createOpaqueVersionRef(createCompanionUuid()))));
  await commitCompanionNodeHistoryWithDb(db, records, 'Create guided sample', 'local_mutation', nodes.map(node => node.id));
  return nodes.map(node => node.id);
}

const settledOwners = new WeakSet<object>();

/** Writes the phone's guided sample before Flow opens on an untouched library, so Flow starts with it. */
export async function ensureCompanionGuidedSample(locale: GuidedSampleLocale = resolveGuidedSampleLocale()) {
  const owner = getIosCompanionDatabaseOwner();
  if (settledOwners.has(owner)) return [];
  if (!await readIosCompanionDatabase(needsGuidedSample)) {
    settledOwners.add(owner);
    return [];
  }
  let created: string[] = [];
  await runCompanionHistoryMutation(async db => (created = await writeGuidedSample(db, locale)),
    ids => ({ kind: 'nodes', nodeIds: ids, structure: true, metadata: true }));
  settledOwners.add(owner);
  return created;
}
