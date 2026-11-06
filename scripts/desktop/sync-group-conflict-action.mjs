import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const NOTE_TEXT = 'Note target beta';

function nowStamp(now) {
  return now().toISOString();
}

export async function createDesktopSyncConflictSeed({ evidenceRoot, existingHighlight = false,
  now = () => new Date(), session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const stamp = nowStamp(now);
  const token = `t152-conflict-${stamp.replace(/\D/gu, '')}`;
  const topicNodeId = `multi-device-sync-conflict-${stamp.replace(/\D/gu, '')}`;
  const nodeId = existingHighlight ? `${topicNodeId}-highlight` : topicNodeId;
  const content = `${token}\n\nCloze target alpha.\n\n${NOTE_TEXT}.`;
  const payload = { activeNodeId: topicNodeId, anchorLink: null, content, createdAt: stamp,
    isTitleManual: false, kind: 'topic', nodeId: topicNodeId,
    nodeOrder: [...snapshot.nodeOrder, topicNodeId], parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length, reveal: null,
    title: `T152 conflict ${token}`, updatedAt: stamp };
  const result = await session.invoke('create_topic', payload);
  if (!result?.createdNodeIds?.includes(topicNodeId)) {
    throw new Error('Desktop product command did not persist the conflict seed.');
  }
  if (existingHighlight) {
    const from = content.indexOf(NOTE_TEXT);
    const child = await session.invoke('create_topic', {
      activeNodeId: nodeId,
      anchorLink: { id: nodeId, kind: 'highlight', locator: {
        from, originalText: NOTE_TEXT, to: from + NOTE_TEXT.length
      } },
      content: NOTE_TEXT, createdAt: stamp, isTitleManual: false, kind: 'topic', nodeId,
      nodeOrder: [...snapshot.nodeOrder, topicNodeId, nodeId], parentNodeId: topicNodeId,
      position: snapshot.nodeOrder.length + 1, reveal: null, title: NOTE_TEXT, updatedAt: stamp
    });
    if (!child?.createdNodeIds?.includes(nodeId)) {
      throw new Error('Desktop product command did not persist the conflict highlight.');
    }
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, 'conflict-seed-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify({ nodeId, resultStatus: 'success', token,
    topicNodeId, updatedAt: stamp }, null, 2)}\n`, 'utf8');
  return { nodeId, receiptPath, token, topicNodeId };
}

export async function forkDesktopSyncConflict({ label, nodeId, session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const metadata = snapshot?.nodesById?.[nodeId];
  if (!metadata) throw new Error('Desktop conflict seed is not visible through the product workspace.');
  const document = await session.invoke('load_node_document', { nodeId });
  if (document?.nodeId !== nodeId || typeof document.content !== 'string') {
    throw new Error('Desktop conflict seed document is unavailable.');
  }
  const node = { ...metadata, ...document };
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(node.updatedAt ?? '') + 1)).toISOString();
  const content = `${node.content}\n\nDesktop fork ${label} ${updatedAt}`;
  const result = await session.invoke('update_node_content', { ...node, content, nodeId, updatedAt });
  if (!result?.updatedNodeIds?.includes(nodeId)) {
    throw new Error('Desktop product command did not persist the conflict fork.');
  }
  return { content, nodeId, updatedAt };
}

export async function loadVisibleDesktopSyncConflict({ nodeId, session }) {
  const conflicts = typeof session.waitForState === 'function'
    ? await session.waitForState({ command: 'load_sync_node_conflicts',
      commandArgs: { objectIds: [nodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 })
    : await session.invoke('load_sync_node_conflicts', { objectIds: [nodeId] });
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    throw new Error('The product did not expose the concurrent business conflict.');
  }
  return { conflictCount: conflicts.length, nodeId, silentOverwrite: false, visible: true };
}

function forkAlternativeMetadata(preview, nodeId) {
  if (preview?.source_node_id !== nodeId || !Array.isArray(preview.alternatives)
      || !preview.alternatives.length || typeof preview.current_content !== 'string') {
    throw new Error('The product did not expose fork alternatives on the original node.');
  }
  const entries = [...preview.alternatives].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (entries.some(entry => typeof entry.id !== 'string' || !entry.id
      || !/^[a-f0-9]{64}$/u.test(entry.body_blob_hash))
      || new Set(entries.map(entry => entry.id)).size !== entries.length
      || !entries.some(entry => entry.id === preview.alternative_id)) {
    throw new Error('Fork alternative identity is invalid.');
  }
  return entries;
}

async function readForkAlternatives({ nodeId, preview, session }) {
  const entries = forkAlternativeMetadata(preview, nodeId);
  const alternatives = [];
  for (const entry of entries) {
    const other = entry.id === preview.alternative_id ? preview
      : await session.invoke('load_node_text_alternative_preview', { node_id: nodeId, alternative_id: entry.id });
    if (other?.alternative_id !== entry.id || other.current_content !== preview.current_content
        || !isDeepStrictEqual(forkAlternativeMetadata(other, nodeId), entries)
        || typeof other.updated_content !== 'string'
        || createHash('sha256').update(other.updated_content).digest('hex') !== entry.body_blob_hash) {
      throw new Error('Fork alternative identity or full body changed while reading.');
    }
    alternatives.push({ ...entry, content: other.updated_content });
  }
  return alternatives;
}

export async function loadConvergedDesktopSyncForks({ desktopLabel = 'macos',
  peerFragment = 'Fri conflict fork', expectedContent, nodeId, session }) {
  const fragments = [peerFragment, `Desktop fork ${desktopLabel}`];
  const preview = await session.waitForState({
    command: 'load_node_text_alternative_preview',
    commandArgs: { node_id: nodeId },
    condition: { fragments, kind: 'body-alternative-preview', nodeId },
    eventName: 'onWorkspaceSyncApplied',
    timeoutMs: 2 * 60_000
  });
  const alternatives = await readForkAlternatives({ nodeId, preview, session });
  const document = await session.invoke('load_node_document', { nodeId });
  const bodies = [preview.current_content, ...alternatives.map(entry => entry.content)];
  const matches = fragments.map(fragment => bodies.flatMap((body, index) => body.includes(fragment) ? [index] : []));
  if (document?.nodeId !== nodeId || document.content !== preview.current_content
      || typeof document.currentVersionId !== 'string' || !document.currentVersionId
      || matches.some(indices => indices.length !== 1) || new Set(matches.flat()).size !== fragments.length
      || (expectedContent !== undefined && !bodies.includes(expectedContent))) {
    throw new Error('The product did not retain both complete fork bodies and their versions.');
  }
  return { alternatives, conflictCount: alternatives.length, currentContent: document.content,
    currentVersionId: document.currentVersionId, nodeId, resolution: 'body-alternatives',
    silentOverwrite: false, visible: true };
}

export async function loadVisibleDesktopSyncConflictBodies({ nodeId, session }) {
  const preview = await session.invoke('load_node_text_alternative_preview', { node_id: nodeId });
  if (preview?.source_node_id !== nodeId || !preview.alternatives?.length) {
    throw new Error('The product did not expose the concurrent body alternative on its original node.');
  }
  const bodies = [preview.current_content, preview.updated_content];
  for (const alternative of preview.alternatives) {
    if (alternative.id === preview.alternative_id) continue;
    const other = await session.invoke('load_node_text_alternative_preview', {
      node_id: nodeId, alternative_id: alternative.id
    });
    if (other?.source_node_id !== nodeId) throw new Error('Conflict alternative identity changed.');
    bodies.push(other.updated_content);
  }
  if (!['A5 note', 'Desktop fork macos'].every((fragment) =>
    bodies.some((body) => typeof body === 'string' && body.includes(fragment)))) {
    throw new Error('The product did not retain both concurrent fork bodies.');
  }
  return { conflictCount: preview.alternatives.length, nodeId,
    resolution: 'body-alternatives', silentOverwrite: false, visible: true };
}
