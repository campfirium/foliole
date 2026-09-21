import fs from 'node:fs';

export function prepareS220EvidenceRoot(root, receiptPath) {
  if (fs.existsSync(receiptPath)) {
    throw new Error('S220 evidence receipt already exists.');
  }
  fs.mkdirSync(root, { recursive: true });
}
