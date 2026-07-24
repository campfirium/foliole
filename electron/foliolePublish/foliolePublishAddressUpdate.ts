import fs from 'node:fs';
import path from 'node:path';

import { upsertNodeSnapshot as upsertNodeSnapshotViaDriver } from '../../lib/core/database/nodeMutations.js';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { readFolioleWebBinding, writeFolioleWebBinding } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { withTransaction } from '../database/transaction.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import type { FoliolePublishIndex, FoliolePublishTopic } from './foliolePublishModel.js';
import { writeFileAtomic } from './foliolePublishModel.js';
import { loadStoredFoliolePublishSettings, saveFoliolePublishSiteAddress } from './foliolePublishSettings.js';
import { activateFoliolePublishSite } from './foliolePublishSite.js';

interface RewritePlan { file: string; next: string; previous: Buffer }

function rewrittenBinding(content: string, topic: FoliolePublishTopic, siteAddress: string) {
  const binding = readFolioleWebBinding(content);
  if (!binding) throw new Error(`Published Topic ${topic.number} is missing its public link data.`);
  return writeFolioleWebBinding(content, {
    ...binding,
    pageId: String(topic.number),
    site: siteAddress,
    url: `${siteAddress}/topics/${topic.number}/`
  });
}

function buildFilePlans(root: string, index: FoliolePublishIndex, siteAddress: string) {
  return index.topics.map((topic): RewritePlan => {
    const file = path.join(root, topic.file);
    const previous = fs.readFileSync(file);
    return { file, next: rewrittenBinding(previous.toString('utf8'), topic, siteAddress), previous };
  });
}

function nodeInput(node: WorkspaceNodeSnapshot, content: string, updatedAt: string, deviceId: string) {
  return {
    anchorLink: node.anchorLink, content, createdAt: node.createdAt,
    desiredRetention: node.desiredRetention ?? null, deviceId,
    enableShortTerm: node.enableShortTerm ?? null, hideTitleHeading: node.hideTitleHeading,
    imageRegions: node.imageRegions ?? null, isTitleManual: node.isTitleManual, kind: node.kind,
    manualChildOrder: node.manualChildOrder ?? null, nodeId: node.id, openingText: node.openingText ?? null,
    parentNodeId: node.parentNodeId, position: node.position ?? null, priority: node.priority ?? null,
    reading: node.reading, reveal: node.reveal, review: node.review,
    sequentialReadingEnabled: node.sequentialReadingEnabled ?? null, shelvedAt: node.shelvedAt ?? null,
    title: node.title, updatedAt, virtualFilter: node.virtualFilter ?? null
  };
}

function buildNodePlans(index: FoliolePublishIndex, siteAddress: string, updatedAt: string, deviceId: string) {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  if (!snapshot) return [];
  return index.topics.flatMap((topic) => {
    const node = topic.source_node_id ? snapshot.nodesById[topic.source_node_id] : null;
    if (!node || node.deletedAt) return [];
    return [nodeInput(node, rewrittenBinding(node.content, topic, siteAddress), updatedAt, deviceId)];
  });
}

function restoreFiles(plans: RewritePlan[]) {
  for (const plan of plans) {
    try { writeFileAtomic(plan.file, plan.previous); } catch { /* best-effort compensation */ }
  }
}

export function commitFoliolePublishAddressUpdate(input: {
  index: FoliolePublishIndex;
  root: string;
  siteAddress: string;
  staged: string;
}) {
  const connection = openDatabaseConnection();
  const previousSiteAddress = loadStoredFoliolePublishSettings()?.site_address ?? null;
  const updatedAt = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(updatedAt);
  const filePlans = buildFilePlans(input.root, input.index, input.siteAddress);
  const nodePlans = buildNodePlans(input.index, input.siteAddress, updatedAt, deviceId);
  const activation = activateFoliolePublishSite(input.root, input.staged);
  try {
    const settings = withTransaction(connection.driver, () => {
      for (const plan of nodePlans) {
        upsertNodeSnapshotViaDriver(connection.driver, plan, { searchInvalidation: { workspaceInvalidation: 'defer' } });
        flushNodeSyncVersionWithDriver(connection.driver, plan.nodeId, deviceId, updatedAt);
      }
      for (const plan of filePlans) writeFileAtomic(plan.file, plan.next);
      return saveFoliolePublishSiteAddress(input.siteAddress);
    });
    activation.commit();
    const updatedNodeIds = nodePlans.map((plan) => plan.nodeId);
    enqueueCoalescedWorkspaceSearchInvalidation(updatedNodeIds);
    scheduleMirrorSync(updatedNodeIds);
    return { settings, updatedNodeIds };
  } catch (error) {
    activation.rollback();
    restoreFiles(filePlans);
    if (previousSiteAddress) {
      try { saveFoliolePublishSiteAddress(previousSiteAddress); } catch { /* best-effort compensation */ }
    }
    throw error;
  }
}
