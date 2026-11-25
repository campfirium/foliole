import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { buildTopicDelayReading, type TopicDelayUnit } from '../../../../store/topicDelayReading';
import type { WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';
import { createCompanionUuid } from '../../companionUuid';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { appendCompanionFlowHistory, companionFlowHistoryKey } from './companionFlowHistoryStore';
import { writeCompanionHistoryReadings } from './companionHistoryLearning';
import { loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

export const companionPostponeHistoryTitle = 'Postpone Topic';

/**
 * Postpones one topic by a number of weeks or days as one undoable action, as the desktop Postpone Topic does.
 * Only the topic's reading changes, so the history step carries no node metadata change.
 */
export function postponeCompanionTopic(args: { nodeId: string; level: number; unit: TopicDelayUnit; now?: string }) {
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const node = await loadCompanionWorkspaceNodeFromDb(db, args.nodeId, host);
    if (!node || node.deletedAt) throw new Error('topic_postpone_unavailable');
    // A topic never read takes its priority from its ancestors, so only then is its path read.
    const path = node.reading ? null
      : await loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: false, pathIds: [args.nodeId] });
    const now = args.now ?? new Date().toISOString();
    const afterReading = buildTopicDelayReading({ nodeId: args.nodeId, level: args.level, unit: args.unit, now,
      nodesById: { ...path, [node.id]: node } });
    if (!afterReading) throw new Error('topic_postpone_unavailable');
    const relatedReadings = [{ nodeId: node.id, beforeReading: node.reading ?? null, afterReading }];
    await writeCompanionHistoryReadings(db, relatedReadings, 'redo');
    const entry: WorkspaceNodeMetadataHistoryEntry = { type: 'nodes.change', id: createCompanionUuid(),
      title: companionPostponeHistoryTitle, rootNodeId: node.id, subtreeNodeIds: null, changes: [], orders: [],
      relatedReadings, beforeSession: null, afterSession: null };
    await appendCompanionFlowHistory(db, companionFlowHistoryKey(host), entry);
    return node.id;
  }, { kind: 'nodes', nodeIds: [], readingNodeIds: [args.nodeId] });
}
