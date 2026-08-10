import fs from 'node:fs';
import path from 'node:path';

function factPayload(device, snapshot, now) {
  const stamp = now().toISOString();
  const nodeId = `t121-${device.toLowerCase()}-${stamp.replace(/\D/gu, '')}`;
  return { activeNodeId: nodeId, anchorLink: null, content: `T121 ${device} fact ${stamp}`,
    createdAt: stamp, isTitleManual: false, kind: 'topic', nodeId,
    nodeOrder: [...snapshot.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length, reveal: null, title: `T121 ${device} fact`, updatedAt: stamp };
}

export async function createDesktopSyncGroupJourneyFact({ device, evidenceRoot, now = () => new Date(),
  session }) {
  if (!['A', 'C'].includes(device)) throw new Error('Desktop journey fact device is invalid.');
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  if (!Array.isArray(snapshot?.nodeOrder)) throw new Error('Desktop workspace snapshot is unavailable.');
  const payload = factPayload(device, snapshot, now);
  const result = await session.invoke('create_topic', payload);
  if (!result?.createdNodeIds?.includes(payload.nodeId)) {
    throw new Error('Desktop product command did not persist the journey fact.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, `${device.toLowerCase()}-fact-receipt.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(), device,
    factId: payload.nodeId, resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { factId: payload.nodeId, receiptPath };
}
