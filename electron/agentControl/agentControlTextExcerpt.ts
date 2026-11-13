import { randomUUID } from 'node:crypto';

import { NODE_PDF_RESOURCES_SQL } from '../../lib/core/database/nodePdfResourcesSql.js';
import { folioleMarkdownParser } from '../../lib/core/markdown/folioleMarkdownParser.js';
import { deriveNodeTitleFromContent } from '../../lib/core/nodes/deriveNodeTitle.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';

import { AgentMaterialMutationError } from './agentControlMaterialMutations.js';
import { readAgentControlMaterial } from './agentControlMaterials.js';

interface ExcerptInput {
  expectedUpdatedAt: string;
  from: number;
  sourceId: string;
  to: number;
}

export function createAgentControlTextExcerpt(input: ExcerptInput) {
  const { sqlite, driver } = openDatabaseConnection();
  return sqlite.transaction(() => {
    const source = readAgentControlMaterial(input.sourceId, 'full');
    if (!source) throw new AgentMaterialMutationError('not_found', 404);
    if (source.deleted || source.updated_at !== input.expectedUpdatedAt) {
      throw new AgentMaterialMutationError('conflict', 409);
    }
    const pdf = driver.queryOne(`SELECT 1 FROM (${NODE_PDF_RESOURCES_SQL}) WHERE node_id = ? LIMIT 1`, [source.id]);
    if (source.kind !== 'topic' || source.special_kind || pdf) throw invalidSelection();
    const locator = resolveSelection(source.content, input.from, input.to);
    const nodeId = `node-${randomUUID()}`;
    const now = new Date().toISOString();
    createVersionedNodeSnapshot({
      anchorLink: { id: `anchor-${randomUUID()}`, kind: 'highlight', locator },
      content: locator.originalText, createdAt: now, isTitleManual: false, kind: 'topic',
      nodeId, parentNodeId: source.id, position: null, reveal: null,
      title: deriveNodeTitleFromContent(locator.originalText), updatedAt: now
    });
    const material = readAgentControlMaterial(nodeId);
    if (!material) throw new AgentMaterialMutationError('not_found', 404);
    return material;
  }).immediate();
}

function resolveSelection(content: string, from: number, to: number) {
  if (from < 0 || from >= to || to > content.length || splitsSurrogate(content, from) ||
      splitsSurrogate(content, to) || content.slice(0, to).includes('\r')) throw invalidSelection();
  const raw = content.slice(from, to);
  const originalText = raw.trim();
  if (!originalText) throw invalidSelection();
  const start = from + raw.length - raw.trimStart().length;
  const end = start + originalText.length;
  let unsupported = false;
  folioleMarkdownParser.parse(content).iterate({
    from: start, to: end,
    enter(node) {
      if (node.from >= end || node.to <= start) return false;
      if (node.name === 'Frontmatter' || node.name === 'Image') unsupported = true;
      return !unsupported;
    }
  });
  if (unsupported) throw invalidSelection();
  return { from: start, originalText, to: end };
}

function splitsSurrogate(content: string, offset: number) {
  const preceding = content.charCodeAt(offset - 1);
  const following = content.charCodeAt(offset);
  return preceding >= 0xd800 && preceding <= 0xdbff && following >= 0xdc00 && following <= 0xdfff;
}

function invalidSelection() {
  return new AgentMaterialMutationError('invalid_request', 400);
}
