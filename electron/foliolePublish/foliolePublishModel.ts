import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FoliolePublishCard {
  file: string;
  id: string;
  published_at: string;
  title: string;
  updated_at: string;
}

export interface FoliolePublishIndex {
  cards: FoliolePublishCard[];
  site: { title: string };
  version: 1;
}

export function stableCardId(nodeId: string) {
  return createHash('sha256').update(nodeId).digest('hex').slice(0, 20);
}

export function emptyPublishIndex(): FoliolePublishIndex {
  return { cards: [], site: { title: 'Foliole' }, version: 1 };
}

export function readPublishIndex(root: string) {
  const file = path.join(root, 'publish.yaml');
  if (!fs.existsSync(file)) return emptyPublishIndex();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as FoliolePublishIndex;
    return parsed.version === 1 && Array.isArray(parsed.cards) ? parsed : emptyPublishIndex();
  } catch {
    throw new Error('Foliole Publish index is unreadable. Restore publish.yaml before publishing again.');
  }
}

export function writeFileAtomic(file: string, contents: string | Buffer) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function writePublishIndex(root: string, index: FoliolePublishIndex) {
  writeFileAtomic(path.join(root, 'publish.yaml'), `${JSON.stringify(index, null, 2)}\n`);
}

export function upsertPublishedCard(index: FoliolePublishIndex, input: { nodeId: string; title: string }) {
  const now = new Date().toISOString();
  const id = stableCardId(input.nodeId);
  const existing = index.cards.find((card) => card.id === id);
  const card: FoliolePublishCard = {
    file: `Content/${id}.md`, id,
    published_at: existing?.published_at ?? now,
    title: input.title.trim() || 'Untitled', updated_at: now
  };
  return { card, index: { ...index, cards: [card, ...index.cards.filter((item) => item.id !== id)] } };
}
