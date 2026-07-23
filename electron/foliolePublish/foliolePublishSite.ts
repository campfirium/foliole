import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readFolioleWebBinding, readFolioleWebMarkdown, type FolioleWebField } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';

import type { FoliolePublishCard, FoliolePublishIndex } from './foliolePublishModel.js';
import { writeFoliolePublishSite } from './foliolePublishSiteWriter.js';
import { readFoliolePublishTheme } from './foliolePublishTheme.js';

function tutorialIndex(): FoliolePublishIndex {
  const now = new Date().toISOString();
  const titles = ['This is Foliole Publish', 'Publish when a card is ready', 'Deploy free with Cloudflare'];
  return { cards: titles.map((title, i) => ({ file: `tutorial-${i}.md`, id: `tutorial-${i}`, published_at: now, title, updated_at: now })), site: { title: 'Foliole Publish' }, version: 1 };
}

const TUTORIAL = [
  'Your public site opens with a compact list of the Topics you publish.',
  'Foliole keeps editing private. Only the Topic you explicitly publish becomes part of this site.',
  'Connect a Cloudflare Pages project in Settings. Your first deployment can use a free `pages.dev` address.'
];

function readCard(root: string, card: FoliolePublishCard, tutorial: boolean) {
  const markdown = tutorial ? TUTORIAL[Number(card.id.at(-1))] ?? '' : fs.readFileSync(path.join(root, card.file), 'utf8');
  return { fields: tutorial ? [] : readFolioleWebBinding(markdown)?.fields ?? [], markdown };
}

type PublishOverrides = Map<string, { content: string; fields: FolioleWebField[] }>;

function selectCard(root: string, card: FoliolePublishCard, tutorial: boolean, overrides: PublishOverrides) {
  const selected = overrides.get(card.id);
  if (selected) return selected;
  const stored = readCard(root, card, tutorial);
  return { content: stored.markdown, fields: stored.fields };
}

function writeStagedSite(root: string, temporary: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides) {
  const tutorial = index.cards.length === 0;
  const source = tutorial ? tutorialIndex() : index;
  const theme = readFoliolePublishTheme(root);
  const publicAddress = siteAddress || 'https://example.pages.dev';
  const selectedCards = source.cards.map((card) => ({ card, selected: selectCard(root, card, tutorial, overrides) }));
  writeFoliolePublishSite({
    index: source,
    publicAddress,
    root: temporary,
    sources: selectedCards.map(({ card, selected }) => ({
      card, fields: selected.fields, markdown: readFolioleWebMarkdown(selected.content)
    })),
    theme
  });
}

export function stageFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides = new Map()) {
  const temporary = path.join(root, `.Site-${randomUUID()}`);
  fs.mkdirSync(path.join(temporary, 'cards'), { recursive: true });
  try {
    writeStagedSite(root, temporary, index, siteAddress, overrides);
  } catch (error) {
    fs.rmSync(temporary, { force: true, recursive: true });
    throw error;
  }
  return temporary;
}

export function activateFoliolePublishSite(root: string, staged: string, directory = 'Site') {
  const destination = path.join(root, directory);
  const backup = path.join(root, `.${directory}-backup-${randomUUID()}`);
  try {
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    fs.renameSync(staged, destination);
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  }
  let settled = false;
  return {
    activePath: path.join(destination, 'index.html'),
    commit() { if (!settled) { settled = true; try { fs.rmSync(backup, { force: true, recursive: true }); } catch { return; } } },
    rollback() { if (!settled) { fs.rmSync(destination, { force: true, recursive: true }); if (fs.existsSync(backup)) fs.renameSync(backup, destination); settled = true; } }
  };
}

export function discardStagedFoliolePublishSite(staged: string) { fs.rmSync(staged, { force: true, recursive: true }); }

export function generateFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string) {
  const staged = stageFoliolePublishSite(root, index, siteAddress);
  try { const activation = activateFoliolePublishSite(root, staged); activation.commit(); return activation.activePath; }
  finally { discardStagedFoliolePublishSite(staged); }
}
