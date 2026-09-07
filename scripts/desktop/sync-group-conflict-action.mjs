import fs from 'node:fs';
import path from 'node:path';

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
  const node = snapshot?.nodesById?.[nodeId];
  if (!node) throw new Error('Desktop conflict seed is not visible through the product workspace.');
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(node.updatedAt ?? '') + 1)).toISOString();
  const result = await session.invoke('update_node_content', { ...node,
    content: `${node.content}\n\nDesktop fork ${label} ${updatedAt}`,
    nodeId, updatedAt });
  if (!result?.updatedNodeIds?.includes(nodeId)) {
    throw new Error('Desktop product command did not persist the conflict fork.');
  }
  return { nodeId, updatedAt };
}

export async function loadVisibleDesktopSyncConflict({ nodeId, session }) {
  const conflicts = await session.invoke('load_sync_node_conflicts', { objectIds: [nodeId] });
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    throw new Error('The product did not expose the concurrent business conflict.');
  }
  return { conflictCount: conflicts.length, nodeId, silentOverwrite: false, visible: true };
}

export async function loadVisibleDesktopSyncConflictCopy({ nodeId, session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const copies = Object.values(snapshot?.nodesById ?? {}).filter((node) => (
    String(node.id).startsWith(`${nodeId}~`) && String(node.content).includes('A5 note')
  ));
  if (copies.length === 0) {
    throw new Error('The product did not expose the concurrent A5 conflict copy.');
  }
  return { conflictCount: copies.length, nodeId, silentOverwrite: false, visible: true };
}
