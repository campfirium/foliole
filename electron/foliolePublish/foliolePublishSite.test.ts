import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { emptyPublishIndex, upsertPublishedCard, writeFileAtomic } from './foliolePublishModel.js';
import { activateFoliolePublishSite, generateFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';

const roots: string[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-site-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('opens on the newest card and emits stable card pages, archive, and RSS', () => {
  const root = temporaryRoot();
  const first = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'one', title: 'Older' });
  writeFileAtomic(path.join(root, first.card.file), 'Older body');
  const second = upsertPublishedCard(first.index, { nodeId: 'two', title: 'Newest' });
  writeFileAtomic(path.join(root, second.card.file), 'Newest **body**');

  const entry = generateFoliolePublishSite(root, second.index, 'https://notes.example.com');

  expect(fs.readFileSync(entry, 'utf8')).toContain('<h1>Newest</h1>');
  expect(fs.readFileSync(path.join(root, 'Site', 'archive.html'), 'utf8')).toContain('Older');
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://notes.example.com/cards/');
  expect(fs.existsSync(path.join(root, 'Site', 'cards', `${second.card.id}.html`))).toBe(true);
});

it('uses the built-in walkthrough when no Topic has been published', () => {
  const root = temporaryRoot();
  const entry = generateFoliolePublishSite(root, emptyPublishIndex(), '');

  expect(fs.readFileSync(entry, 'utf8')).toContain('This is Foliole Publish');
  expect(fs.readFileSync(path.join(root, 'Site', 'cards', 'tutorial-1.html'), 'utf8')).toContain('Only the Topic');
});

it('restores the exact active site when a staged activation rolls back', () => {
  const root = temporaryRoot();
  const current = generateFoliolePublishSite(root, emptyPublishIndex(), 'https://old.pages.dev');
  const oldRss = fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8');
  const staged = stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.example.com');
  const activation = activateFoliolePublishSite(root, staged);
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://new.example.com');
  activation.rollback();
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toBe(oldRss);
  expect(fs.existsSync(current)).toBe(true);
});

it('keeps the new active site when old backup cleanup fails after commit', () => {
  const root = temporaryRoot();
  generateFoliolePublishSite(root, emptyPublishIndex(), 'https://old.pages.dev');
  const staged = stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.example.com');
  const activation = activateFoliolePublishSite(root, staged);
  const remove = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => { throw new Error('cleanup failed'); });
  expect(() => activation.commit()).not.toThrow();
  remove.mockRestore();
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://new.example.com');
});
