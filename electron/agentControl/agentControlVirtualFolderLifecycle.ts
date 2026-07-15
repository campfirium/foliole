import { replaceTopicCollection } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';
import { restoreNodes, softDeleteNodes } from '../database/nodeMutations.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import {
  readAgentControlNodeSnapshot,
  rewriteAgentControlNodeSnapshot
} from './agentControlMaterialMutations.js';
import {
  AgentVirtualFolderMutationError,
  ensureUniqueTitle,
  normalizeTitle
} from './agentControlVirtualFolderMutations.js';
import {
  readAgentVirtualFolderRow,
  readAgentVirtualFolderTopics,
  readTopicContent
} from './agentControlVirtualFolders.js';

export function updateAgentControlVirtualFolder(input: { expectedUpdatedAt: string; id: string; title: string }) {
  const result = renameCollectionVirtualFolder(input);
  return { folder_id: result.folder_id, title: result.title, updated_at: result.updated_at };
}

export function renameCollectionVirtualFolder(input: {
  expectedUpdatedAt: string;
  id: string;
  title: string;
  updatedAt?: string;
}) {
  const result = openDatabaseConnection().driver.transaction(() => {
    const row = requireState(input.id, false, input.expectedUpdatedAt);
    const title = normalizeTitle(input.title);
    if (title === row.title) {
      return {
        collectionRenames: [],
        folder_id: input.id,
        nodes: [readAgentControlNodeSnapshot(input.id)],
        title,
        updated_at: row.updated_at,
        updatedNodeIds: [input.id]
      };
    }
    ensureUniqueTitle(title, input.id);
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const topics = readAgentVirtualFolderTopics(row.title);
    for (const topic of topics) {
      rewriteAgentControlNodeSnapshot({
        content: replaceTopicCollection(readTopicContent(topic), row.title, title),
        id: topic.id,
        updatedAt
      });
    }
    rewriteAgentControlNodeSnapshot({
      id: input.id,
      title,
      updatedAt,
      virtualFilter: createCollectionVirtualNodeFilter(title)
    });
    const updatedNodeIds = [input.id, ...topics.map((topic) => topic.id)];
    return {
      collectionRenames: [{ from: row.title, nodeIds: topics.map((topic) => topic.id), to: title }],
      folder_id: input.id,
      nodes: updatedNodeIds.map(readAgentControlNodeSnapshot),
      title,
      updated_at: updatedAt,
      updatedNodeIds
    };
  });
  scheduleMirrorSync(result.updatedNodeIds);
  return result;
}

export function softDeleteAgentControlVirtualFolder(input: { expectedUpdatedAt: string; id: string }) {
  requireState(input.id, false, input.expectedUpdatedAt);
  const deletedAt = new Date().toISOString();
  softDeleteNodes({ deletedAt, nodeIds: [input.id] });
  return { deleted: true, deleted_at: deletedAt, folder_id: input.id };
}

export function restoreAgentControlVirtualFolder(input: { expectedUpdatedAt: string; id: string }) {
  const row = requireState(input.id, true, input.expectedUpdatedAt);
  ensureUniqueTitle(row.title, input.id);
  restoreNodes({ nodeIds: [input.id] });
  const restored = readAgentVirtualFolderRow(input.id, true);
  return { folder_id: input.id, restored: true, updated_at: restored?.updated_at ?? row.updated_at };
}

function requireState(id: string, deleted: boolean, expectedUpdatedAt: string) {
  const row = readAgentVirtualFolderRow(id, true);
  if (!row) throw new AgentVirtualFolderMutationError('not_found', 404);
  if (Boolean(row.deleted_at) !== deleted || row.updated_at !== expectedUpdatedAt) {
    throw new AgentVirtualFolderMutationError('conflict', 409);
  }
  return row;
}
