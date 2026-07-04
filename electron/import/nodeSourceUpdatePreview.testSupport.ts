import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

export function seedMirrorTopic(input: { content?: string; id: string; relativePath: string }) {
  const now = '2026-03-28T04:00:00.000Z';
  upsertNodeSnapshot({
    anchorLink: null,
    content: input.content ?? 'Current mirror content',
    createdAt: now,
    isTitleManual: true,
    kind: 'topic',
    nodeId: input.id,
    parentNodeId: null,
    position: null,
    priority: null,
    reveal: null,
    title: input.id,
    updatedAt: now
  });
  openDatabaseConnection().driver.execute(
    `INSERT INTO mirror_articles (article_id, relative_path, mirrored_at)
     VALUES (?, ?, ?)`,
    [input.id, input.relativePath, now]
  );
}
