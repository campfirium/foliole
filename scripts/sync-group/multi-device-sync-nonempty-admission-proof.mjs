import fs from 'node:fs';
import path from 'node:path';

const MATERIAL_FILE = 'nonempty-c-material.json';

function hasLocalMaterial(facts, material) {
  return facts?.facts?.[material.factId] === true
    && facts?.attachmentIds?.includes(material.attachmentId)
    && facts?.availableAttachmentIds?.includes(material.attachmentId);
}

export function assertWindowsNonemptyAdmissionReceipt(receipt) {
  const material = receipt?.localFact;
  if (typeof material?.factId !== 'string' || typeof material?.attachmentId !== 'string'
      || receipt.preJoinFacts?.localGroupId !== null
      || receipt.preJoinFacts?.localTimelineId !== null
      || receipt.preJoinFacts?.localMemberState !== null
      || !hasLocalMaterial(receipt.preJoinFacts, material)
      || !hasLocalMaterial(receipt.firstFacts, material)
      || !hasLocalMaterial(receipt.restartedFacts, material)) {
    throw new Error('Windows C did not preserve its pre-join material.');
  }
  return material;
}

export function writeNonemptyAdmissionMaterial(evidenceRoot, receipt) {
  const material = assertWindowsNonemptyAdmissionReceipt(receipt);
  const evidenceRef = path.join(evidenceRoot, MATERIAL_FILE);
  fs.writeFileSync(evidenceRef, `${JSON.stringify({
    ...material, completedAt: new Date().toISOString(), resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef, material };
}

export function readNonemptyAdmissionMaterial(repoRoot, runId) {
  const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'b-admit-c', MATERIAL_FILE);
  const material = JSON.parse(fs.readFileSync(evidenceRef, 'utf8'));
  if (material.resultStatus !== 'success' || typeof material.factId !== 'string'
      || typeof material.attachmentId !== 'string') {
    throw new Error('Nonempty Windows C admission material receipt is invalid.');
  }
  return material;
}
