import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { ensureFoliolePublishTheme, resetFoliolePublishThemeFiles } from './foliolePublishTheme.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('keeps the single editable Theme until Reset theme is explicitly used', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-theme-'));
  roots.push(root);
  const theme = ensureFoliolePublishTheme(root);
  const page = path.join(theme, 'page.html');
  fs.writeFileSync(page, 'AI edited {{content}}');

  expect(ensureFoliolePublishTheme(root)).toBe(theme);
  expect(fs.readFileSync(page, 'utf8')).toBe('AI edited {{content}}');

  resetFoliolePublishThemeFiles(root);
  expect(fs.readFileSync(page, 'utf8')).toContain('<!doctype html>');
  expect(fs.readFileSync(page, 'utf8')).toContain('{{ page.content | raw }}');
  expect(fs.readFileSync(page, 'utf8')).toContain('<div class="topic-stream">');
  expect(fs.readFileSync(page, 'utf8')).toContain('{% for card in page.cards %}');
  expect(fs.readFileSync(page, 'utf8')).not.toContain('keyboard-hint');
  expect(fs.readFileSync(path.join(theme, 'archive.html'), 'utf8')).toContain('{% for group in page.groups %}');
  expect(fs.readFileSync(path.join(theme, 'site.js'), 'utf8')).toContain('data-search-form');
  expect(fs.readFileSync(path.join(theme, 'style.css'), 'utf8')).toContain('color-scheme: light');
  expect(fs.readFileSync(path.join(theme, 'style.css'), 'utf8')).not.toContain('prefers-color-scheme: dark');
});
