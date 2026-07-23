import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  loadFoliolePublishTheme,
  openOrCreateFoliolePublishCustomTheme,
  readFoliolePublishTheme,
  useFoliolePublishOfficialTheme
} from './foliolePublishTheme.js';
import {
  FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION,
  FOLIOLE_PUBLISH_THEME_STATE_FILE,
  hashFoliolePublishTheme,
  type FoliolePublishThemeFile,
  type FoliolePublishThemeHashes
} from './foliolePublishThemeState.js';

const roots: string[] = [];
const names: FoliolePublishThemeFile[] = ['archive.html', 'page.html', 'site.js', 'style.css'];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-theme-'));
  roots.push(root);
  return root;
}

function rootState(root: string) { return path.join(root, FOLIOLE_PUBLISH_THEME_STATE_FILE); }
function customTheme(root: string) { return path.join(root, 'Theme'); }

function customHashes(root: string) {
  return Object.fromEntries(names.map((name) => [
    name, hashFoliolePublishTheme(fs.readFileSync(path.join(customTheme(root), name), 'utf8'))
  ])) as FoliolePublishThemeHashes;
}

function prepareLegacyTheme(root: string) {
  openOrCreateFoliolePublishCustomTheme(root);
  const hashes = customHashes(root);
  fs.rmSync(rootState(root));
  fs.writeFileSync(path.join(customTheme(root), FOLIOLE_PUBLISH_THEME_STATE_FILE), JSON.stringify({
    files: hashes, official_theme_version: 3, version: 1
  }));
  return hashes;
}

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('uses the current read-only Foliole Theme in a new library', () => {
  const root = temporaryRoot();
  const theme = readFoliolePublishTheme(root);

  expect(loadFoliolePublishTheme(root)).toEqual({
    active_theme: 'foliole', custom_theme: null,
    official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
  });
  expect(fs.existsSync(customTheme(root))).toBe(false);
  expect(fs.existsSync(rootState(root))).toBe(true);
  expect(theme['page.html']).toContain('{{ page.content | raw }}');
  expect(theme['page.html']).toContain('data-empty-publish-activity');
  expect(theme['archive.html']).toContain('{% for group in page.groups %}');
  expect(theme['site.js']).toContain('data-empty-publish-word');
  expect(theme['style.css']).toContain('prefers-reduced-motion: reduce');
});

it('keeps Custom Theme bytes while switching both real slots', () => {
  const root = temporaryRoot();
  const selected = openOrCreateFoliolePublishCustomTheme(root);
  const page = path.join(selected.path, 'page.html');
  fs.writeFileSync(page, 'AI edited {{content}}');

  expect(readFoliolePublishTheme(root)['page.html']).toBe('AI edited {{content}}');
  expect(useFoliolePublishOfficialTheme(root).active_theme).toBe('foliole');
  expect(readFoliolePublishTheme(root)['page.html']).toContain('<!doctype html>');
  expect(fs.readFileSync(page, 'utf8')).toBe('AI edited {{content}}');

  const reopened = openOrCreateFoliolePublishCustomTheme(root);
  expect(reopened.status).toMatchObject({
    active_theme: 'custom',
    custom_theme: { based_on_official_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION }
  });
  expect(readFoliolePublishTheme(root)['page.html']).toBe('AI edited {{content}}');
});

it('migrates an untouched v1 Theme to the Foliole slot', () => {
  const root = temporaryRoot();
  prepareLegacyTheme(root);

  expect(loadFoliolePublishTheme(root)).toMatchObject({ active_theme: 'foliole', custom_theme: null });
  expect(fs.existsSync(rootState(root))).toBe(true);
  expect(fs.existsSync(path.join(customTheme(root), FOLIOLE_PUBLISH_THEME_STATE_FILE))).toBe(true);
});

it('migrates edited or mixed v1 files as an unknown-baseline Custom Theme', () => {
  const root = temporaryRoot();
  prepareLegacyTheme(root);
  fs.writeFileSync(path.join(customTheme(root), 'style.css'), 'custom style');

  expect(loadFoliolePublishTheme(root)).toEqual({
    active_theme: 'custom', custom_theme: { based_on_official_version: null },
    official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
  });
  expect(readFoliolePublishTheme(root)['style.css']).toBe('custom style');
});

it('preserves existing files as Custom Theme when v1 metadata is unreadable', () => {
  const root = temporaryRoot();
  prepareLegacyTheme(root);
  fs.writeFileSync(path.join(customTheme(root), FOLIOLE_PUBLISH_THEME_STATE_FILE), '{broken');

  expect(loadFoliolePublishTheme(root)).toMatchObject({
    active_theme: 'custom', custom_theme: { based_on_official_version: null }
  });
});

it('fails closed when the selected Custom Theme is incomplete', () => {
  const root = temporaryRoot();
  openOrCreateFoliolePublishCustomTheme(root);
  fs.rmSync(path.join(customTheme(root), 'page.html'));

  expect(() => readFoliolePublishTheme(root)).toThrow(
    'Custom Theme is missing page.html. Open Custom Theme and restore it.'
  );
});

it('keeps Foliole Theme active when Custom Theme creation is interrupted', () => {
  const root = temporaryRoot();
  readFoliolePublishTheme(root);
  const renameSync = fs.renameSync;
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (String(to).endsWith('style.css')) throw new Error('disk full');
    return renameSync(from, to);
  });
  expect(() => openOrCreateFoliolePublishCustomTheme(root)).toThrow('disk full');
  rename.mockRestore();

  expect(loadFoliolePublishTheme(root)).toMatchObject({ active_theme: 'foliole', custom_theme: null });
  expect(openOrCreateFoliolePublishCustomTheme(root).status.active_theme).toBe('custom');
});

it('does not fall back when the root theme selection is unreadable', () => {
  const root = temporaryRoot();
  readFoliolePublishTheme(root);
  fs.writeFileSync(rootState(root), '{broken');
  expect(() => readFoliolePublishTheme(root)).toThrow('theme selection is unreadable');
});
