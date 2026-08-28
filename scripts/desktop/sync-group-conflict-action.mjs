import fs from 'node:fs';
import path from 'node:path';

const NOTE_TEXT = 'Note target beta';

function nowStamp(now) {
  return now().toISOString();
}

export async function createDesktopSyncConflictSeed({ evidenceRoot, now = () => new Date(),
  session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const stamp = nowStamp(now);
  const token = `t152-conflict-${stamp.replace(/\D/gu, '')}`;
  const nodeId = `multi-device-sync-conflict-${stamp.replace(/\D/gu, '')}`;
  const payload = { activeNodeId: nodeId, anchorLink: null,
    content: `${token}\n\nCloze target alpha.\n\n${NOTE_TEXT}.`, createdAt: stamp,
    isTitleManual: false, kind: 'topic', nodeId,
    nodeOrder: [...snapshot.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length, reveal: null,
    title: `T152 conflict ${token}`, updatedAt: stamp };
  const result = await session.invoke('create_topic', payload);
  if (!result?.createdNodeIds?.includes(nodeId)) {
    throw new Error('Desktop product command did not persist the conflict seed.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, 'conflict-seed-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify({ nodeId, resultStatus: 'success', token,
    updatedAt: stamp }, null, 2)}\n`, 'utf8');
  return { nodeId, receiptPath, token };
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
