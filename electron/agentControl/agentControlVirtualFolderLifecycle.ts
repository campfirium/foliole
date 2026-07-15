import { replaceTopicCollection } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';
import { restoreNodes, softDeleteNodes } from '../database/nodeMutations.js';

import { rewriteAgentControlNodeSnapshot } from './agentControlMaterialMutations.js';
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
  return openDatabaseConnection().driver.transaction(() => {
    const row = requireState(input.id, false, input.expectedUpdatedAt);
    const title = normalizeTitle(input.title);
    if (title === row.title) return { folder_id: input.id, title, updated_at: row.updated_at };
    ensureUniqueTitle(title, input.id);
    const updatedAt = new Date().toISOString();
    for (const topic of readAgentVirtualFolderTopics(row.title)) {
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
    return { folder_id: input.id, title, updated_at: updatedAt };
  });
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
