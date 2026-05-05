import { resolveBackfilledNodeOpeningTextById } from '../../lib/core/database/nodeOpeningTextBackfill.js';
import { openDatabaseConnection } from '../database/connection.js';

interface PreparedBookNodeLike {
  content: string;
  key: string;
  parentKey: string | null;
  title: string;
}

interface PreparedRootNodeLike {
  content: string;
}

export function persistImportedOpeningTexts(input: {
  finalizedNodes: PreparedBookNodeLike[];
  finalizedRoot: PreparedRootNodeLike;
  nodeIdsByKey: Map<string, string>;
  rootNodeId: string;
  rootTitle: string;
}) {
  const openingTextById = resolveBackfilledNodeOpeningTextById({
    nodeOrderRows: [
      { node_id: input.rootNodeId },
      ...input.finalizedNodes.map((node) => ({ node_id: input.nodeIdsByKey.get(node.key) ?? node.key }))
    ],
    nodeRows: [
      { content: input.finalizedRoot.content, id: input.rootNodeId, kind: 'topic', parent_id: null, title: input.rootTitle },
      ...input.finalizedNodes.map((node) => ({
        content: node.content,
        id: input.nodeIdsByKey.get(node.key) ?? node.key,
        kind: 'topic',
        parent_id: node.parentKey ? (input.nodeIdsByKey.get(node.parentKey) ?? input.rootNodeId) : input.rootNodeId,
        title: node.title
      }))
    ],
    pdfOpeningRows: []
  });
  const connection = openDatabaseConnection();
  const updateStatement = connection.sqlite.prepare('UPDATE nodes SET opening_text = ? WHERE id = ?');
  const runInTransaction = connection.sqlite.transaction(() => {
    for (const [nodeId, openingText] of openingTextById.entries()) {
      updateStatement.run(openingText, nodeId);
    }
  });
  runInTransaction();
}
