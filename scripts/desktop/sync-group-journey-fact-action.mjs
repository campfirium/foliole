import fs from 'node:fs';
import path from 'node:path';

function factPayload(device, snapshot, now) {
  const stamp = now().toISOString();
  const nodeId = `multi-device-sync-${device.toLowerCase()}-${stamp.replace(/\D/gu, '')}`;
  return { activeNodeId: nodeId, anchorLink: null, content: `Multi-device sync ${device} fact ${stamp}`,
    createdAt: stamp, isTitleManual: false, kind: 'topic', nodeId,
    nodeOrder: [...snapshot.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length, reveal: null,
    title: `Multi-device sync ${device} fact`, updatedAt: stamp };
}

const JOURNEY_PNG_BASE64 = Object.freeze({
  A: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  C: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/bo8wWQAAAABJRU5ErkJggg=='
});

export async function createDesktopSyncGroupJourneyFact({ device, evidenceRoot, now = () => new Date(),
  session, withAttachment = false }) {
  if (!['A', 'C'].includes(device)) throw new Error('Desktop journey fact device is invalid.');
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  if (!Array.isArray(snapshot?.nodeOrder)) throw new Error('Desktop workspace snapshot is unavailable.');
  const payload = factPayload(device, snapshot, now);
  const result = await session.invoke('create_topic', payload);
  if (!result?.createdNodeIds?.includes(payload.nodeId)) {
    throw new Error('Desktop product command did not persist the journey fact.');
  }
  const attachment = withAttachment ? await session.invoke('import_clipboard_image_attachment', {
    bytesBase64: JOURNEY_PNG_BASE64[device], mimeType: 'image/png', nodeId: payload.nodeId,
    originalName: `${payload.nodeId}.png`
  }) : null;
  if (withAttachment && attachment?.status !== 'imported') {
    throw new Error('Desktop product command did not persist the journey attachment.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, `${device.toLowerCase()}-fact-receipt.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(), device,
    attachmentId: attachment?.attachment_id ?? null, factId: payload.nodeId,
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { attachmentId: attachment?.attachment_id ?? null, factId: payload.nodeId, receiptPath };
}
