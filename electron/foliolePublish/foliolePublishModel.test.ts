import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { emptyPublishIndex, readPublishIndex, stableCardId, upsertPublishedCard, writePublishIndex } from './foliolePublishModel.js';

const roots: string[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-model-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('uses a stable public card id and moves an updated card to the front', () => {
  const first = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'topic-1', title: 'First' });
  const second = upsertPublishedCard(first.index, { nodeId: 'topic-2', title: 'Second' });
  const updated = upsertPublishedCard(second.index, { nodeId: 'topic-1', title: 'First revised' });

  expect(updated.card.id).toBe(stableCardId('topic-1'));
  expect(updated.index.cards.map((card) => card.title)).toEqual(['First revised', 'Second']);
  expect(updated.card.published_at).toBe(first.card.published_at);
});

it('round-trips the versioned publish index without storing Topic content', () => {
  const root = temporaryRoot();
  const { index } = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'topic-1', title: 'Public card' });
  writePublishIndex(root, index);

  expect(readPublishIndex(root)).toEqual(index);
  expect(fs.readFileSync(path.join(root, 'publish.yaml'), 'utf8')).not.toContain('private body');
});
