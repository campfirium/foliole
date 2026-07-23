import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { ensureFoliolePublishTheme, resetFoliolePublishThemeFiles } from './foliolePublishTheme.js';
import {
  FOLIOLE_PUBLISH_THEME_STATE_FILE,
  hashFoliolePublishTheme,
  planFoliolePublishThemeUpgrade,
  type FoliolePublishThemeFile,
  type FoliolePublishThemeHashes
} from './foliolePublishThemeState.js';

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
  expect(fs.readFileSync(page, 'utf8')).toContain('<h2 class="topic-title">Writing</h2>');
  expect(fs.readFileSync(page, 'utf8')).toContain('<header class="page-header">');
  expect(fs.readFileSync(page, 'utf8')).not.toContain('keyboard-hint');
  expect(fs.readFileSync(path.join(theme, 'archive.html'), 'utf8')).toContain('{% for group in page.groups %}');
  expect(fs.readFileSync(path.join(theme, 'site.js'), 'utf8')).toContain('data-search-form');
  expect(fs.readFileSync(path.join(theme, 'style.css'), 'utf8')).toContain('color-scheme: light');
  expect(fs.readFileSync(path.join(theme, 'style.css'), 'utf8')).not.toContain('prefers-color-scheme: dark');
  expect(fs.existsSync(path.join(theme, FOLIOLE_PUBLISH_THEME_STATE_FILE))).toBe(true);
});

it('recognizes the previous stock theme while preserving its edited files', () => {
  const previous: FoliolePublishThemeHashes = {
    'archive.html': '5f335f51e38e1366e46030193aa84e8f20bf489f03d08d4d314adb693c7c4a91',
    'page.html': 'f8164c4f6551b820ffda3f0422c9bc7e7088a15ae90c19b17828d1a308434b85',
    'site.js': 'b5c86e07df1544d2264a6b6b289db0049aaff06a4a450ff167a0928310c45905',
    'style.css': 'custom-style'
  };

  expect(planFoliolePublishThemeUpgrade(previous, null)).toEqual([
    'archive.html', 'page.html', 'site.js'
  ]);
});

it('upgrades tracked official files without replacing a customized file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-theme-upgrade-'));
  roots.push(root);
  const theme = resetFoliolePublishThemeFiles(root);
  const names: FoliolePublishThemeFile[] = ['archive.html', 'page.html', 'site.js', 'style.css'];
  const oldPage = 'old official page';
  fs.writeFileSync(path.join(theme, 'page.html'), oldPage);
  const files = Object.fromEntries(names.map((name) => [
    name, hashFoliolePublishTheme(fs.readFileSync(path.join(theme, name), 'utf8'))
  ]));
  fs.writeFileSync(path.join(theme, FOLIOLE_PUBLISH_THEME_STATE_FILE), JSON.stringify({
    files, official_theme_version: 1, version: 1
  }));
  fs.writeFileSync(path.join(theme, 'style.css'), 'custom style');

  ensureFoliolePublishTheme(root);

  expect(fs.readFileSync(path.join(theme, 'page.html'), 'utf8')).not.toBe(oldPage);
  expect(fs.readFileSync(path.join(theme, 'page.html'), 'utf8')).toContain('Writing');
  expect(fs.readFileSync(path.join(theme, 'style.css'), 'utf8')).toBe('custom style');
});
