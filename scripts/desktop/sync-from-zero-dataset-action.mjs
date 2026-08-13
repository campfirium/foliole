import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { SYNC_FROM_ZERO_DATASET } from '../sync-group/sync-from-zero-contract.mjs';

const PNG_BASE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function nodePayload(index, order, dataset, now) {
  const suffix = String(index + 1).padStart(3, '0');
  const nodeId = `${dataset.nodePrefix}${suffix}`;
  const stamp = now().toISOString();
  const marker = `Sync from zero body ${suffix}`;
  return { activeNodeId: nodeId, anchorLink: null,
    content: `${marker}\n${String.fromCharCode(65 + (index % 26)).repeat(dataset.contentBodyBytes)}`,
    createdAt: stamp, isTitleManual: false, kind: 'topic', nodeId,
    nodeOrder: [...order, nodeId], parentNodeId: 'special-inbox', position: order.length,
    reveal: null, title: `Sync from zero topic ${suffix}`, updatedAt: stamp };
}

function attachmentBytes(index, size) {
  if (size < PNG_BASE.length + 4) throw new Error('Sync-from-zero attachment budget is too small.');
  const bytes = Buffer.alloc(size, (index % 251) + 1);
  PNG_BASE.copy(bytes, 0);
  bytes.writeUInt32BE(index, size - 4);
  return bytes;
}

async function createNodes(session, dataset, now, onProgress) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  if (!Array.isArray(snapshot?.nodeOrder)) throw new Error('Desktop workspace snapshot is unavailable.');
  const order = [...snapshot.nodeOrder];
  const nodes = [];
  for (let index = 0; index < dataset.nodeCount; index += 1) {
    const payload = nodePayload(index, order, dataset, now);
    const result = await session.invoke('create_topic', payload);
    if (!result?.createdNodeIds?.includes(payload.nodeId)) {
      throw new Error('Desktop product command did not persist the sync-from-zero topic.');
    }
    order.push(payload.nodeId);
    nodes.push({ contentHash: createHash('sha256').update(payload.content).digest('hex'),
      nodeId: payload.nodeId });
    if ((index + 1) % 8 === 0 || index + 1 === dataset.nodeCount) {
      onProgress?.({ completed: index + 1, phase: 'nodes', total: dataset.nodeCount });
    }
  }
  return nodes;
}

async function createAttachments(session, nodes, dataset, onProgress) {
  const attachments = [];
  for (let index = 0; index < dataset.attachmentCount; index += 1) {
    const bytes = attachmentBytes(index, dataset.attachmentBytes);
    const nodeId = nodes[index % nodes.length].nodeId;
    const result = await session.invoke('import_clipboard_image_attachment', {
      bytesBase64: bytes.toString('base64'), mimeType: 'image/png', nodeId,
      originalName: `sync-from-zero-${String(index + 1).padStart(3, '0')}.png`
    });
    if (result?.status !== 'imported') {
      throw new Error('Desktop product command did not persist a sync-from-zero attachment.');
    }
    attachments.push({ attachmentId: result.attachment_id, sizeBytes: bytes.length });
    if ((index + 1) % 8 === 0 || index + 1 === dataset.attachmentCount) {
      onProgress?.({ completed: index + 1, phase: 'attachments', total: dataset.attachmentCount });
    }
  }
  return attachments;
}

export async function createSyncFromZeroDataset({ dataset = SYNC_FROM_ZERO_DATASET, evidenceRoot,
  now = () => new Date(), onProgress, session }) {
  const nodes = await createNodes(session, dataset, now, onProgress);
  const attachments = await createAttachments(session, nodes, dataset, onProgress);
  for (const { attachmentId } of attachments) {
    const resolved = await session.invoke('resolve_attachment_resource', { attachment_id: attachmentId });
    if (resolved?.status !== 'ready') throw new Error('Desktop dataset attachment resource is unavailable.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, 'sync-from-zero-dataset-receipt.json');
  const receipt = { attachmentCount: attachments.length,
    attachmentIds: attachments.map(({ attachmentId }) => attachmentId),
    attachmentBytes: attachments.reduce((sum, item) => sum + item.sizeBytes, 0),
    completedAt: new Date().toISOString(), contentHashes: nodes.map(({ contentHash }) => contentHash),
    nodeCount: nodes.length, nodeIds: nodes.map(({ nodeId }) => nodeId),
    resultStatus: 'success', schemaVersion: 1 };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { ...receipt, receiptPath };
}
