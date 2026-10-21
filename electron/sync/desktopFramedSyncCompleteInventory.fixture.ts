import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';

export function seedCompleteInventoryFixture(count: number, bodyBytes = 8192) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('fixture_node_count_invalid');
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 32) throw new Error('fixture_body_bytes_invalid');
  const now = '2026-10-05T00:00:00.000Z';
  const id = (value: number) => `t326-complete-${String(value).padStart(5, '0')}`;
  openDatabaseConnection().sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const prefix = `Body ${index}\n`;
      upsertNodeSnapshot({ anchorLink: null,
        content: prefix + 'x'.repeat(bodyBytes - Buffer.byteLength(prefix)), createdAt: now,
        isTitleManual: true, kind: 'topic', nodeId: id(index),
        parentNodeId: index % 100 === 0 ? null : id(Math.floor(index / 100) * 100),
        position: 0, reveal: null, title: `Complete inventory ${index}`, updatedAt: now });
    }
    flushDirtyNodeSyncVersions();
  })();
  return { nodeCount: count, bodyBytes };
}
