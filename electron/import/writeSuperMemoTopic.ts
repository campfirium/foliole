import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { replaceNodeImageResourceReferences } from '../database/nodeResources.js';

import { prepareSuperMemoTopicContent } from './prepareSuperMemoTopicContent.js';

type TopicSnapshot = Omit<Parameters<typeof upsertNodeSnapshot>[0], 'kind' | 'content' | 'reveal'>;

export async function writeSuperMemoTopic(
  snapshot: TopicSnapshot, parts: string[], collectionDirectory?: string
) {
  return runWithDatabaseConnectionOwner(async () => {
    const { driver } = openDatabaseConnection();
    const prepared = await prepareSuperMemoTopicContent(parts, collectionDirectory);
    driver.transaction(() => persistSuperMemoTopic(snapshot, prepared));
    return { unresolvedImages: prepared.unresolvedImages };
  });
}

export function persistSuperMemoTopic(snapshot: TopicSnapshot, prepared: Awaited<ReturnType<typeof prepareSuperMemoTopicContent>>) {
  upsertNodeSnapshot({ ...snapshot, kind: 'topic', content: prepared.content, reveal: null });
  if (prepared.resourceReferences.length) replaceNodeImageResourceReferences(snapshot.nodeId, prepared.resourceReferences);
}
