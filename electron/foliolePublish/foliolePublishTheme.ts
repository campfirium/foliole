import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_THEME_SCRIPT } from './foliolePublishDefaultScript.js';
import { DEFAULT_THEME_STYLE } from './foliolePublishDefaultStyle.js';
import { DEFAULT_ARCHIVE_TEMPLATE, DEFAULT_PAGE_TEMPLATE } from './foliolePublishDefaultTemplates.js';
import { writeFileAtomic } from './foliolePublishModel.js';
import {
  recordFoliolePublishOfficialTheme,
  upgradeFoliolePublishOfficialTheme,
  type FoliolePublishThemeFile
} from './foliolePublishThemeState.js';

const FILES: Record<FoliolePublishThemeFile, string> = {
  'archive.html': DEFAULT_ARCHIVE_TEMPLATE,
  'page.html': DEFAULT_PAGE_TEMPLATE,
  'site.js': DEFAULT_THEME_SCRIPT,
  'style.css': DEFAULT_THEME_STYLE
};

export function resetFoliolePublishThemeFiles(root: string) {
  const theme = path.join(root, 'Theme');
  fs.mkdirSync(theme, { recursive: true });
  for (const [name, contents] of Object.entries(FILES)) writeFileAtomic(path.join(theme, name), contents);
  recordFoliolePublishOfficialTheme(theme, FILES);
  return theme;
}

export function ensureFoliolePublishTheme(root: string) {
  const theme = path.join(root, 'Theme');
  if (!fs.existsSync(theme)) return resetFoliolePublishThemeFiles(root);
  const missing = Object.keys(FILES).filter((name) => !fs.existsSync(path.join(theme, name)));
  if (missing.length > 0) throw new Error(`Theme is missing ${missing.join(', ')}. Use Reset theme to restore it.`);
  upgradeFoliolePublishOfficialTheme(theme, FILES);
  return theme;
}

export function readFoliolePublishTheme(root: string) {
  const theme = ensureFoliolePublishTheme(root);
  return Object.fromEntries(Object.keys(FILES).map((name) => [name, fs.readFileSync(path.join(theme, name), 'utf8')])) as Record<keyof typeof FILES, string>;
}
