import { DEFAULT_THEME_SCRIPT } from './foliolePublishDefaultScript.js';
import { DEFAULT_THEME_STYLE } from './foliolePublishDefaultStyle.js';
import { DEFAULT_ARCHIVE_TEMPLATE, DEFAULT_PAGE_TEMPLATE } from './foliolePublishDefaultTemplates.js';
import {
  activateFoliolePublishCustomTheme,
  activateFoliolePublishOfficialTheme,
  ensureFoliolePublishCustomTheme,
  loadFoliolePublishThemeStatus,
  readFoliolePublishCustomTheme,
  type FoliolePublishThemeFiles
} from './foliolePublishThemeState.js';

const OFFICIAL_THEME_FILES: FoliolePublishThemeFiles = {
  'archive.html': DEFAULT_ARCHIVE_TEMPLATE,
  'page.html': DEFAULT_PAGE_TEMPLATE,
  'site.js': DEFAULT_THEME_SCRIPT,
  'style.css': DEFAULT_THEME_STYLE
};

export function loadFoliolePublishTheme(root: string) {
  return loadFoliolePublishThemeStatus(root);
}

export function openOrCreateFoliolePublishCustomTheme(root: string) {
  const prepared = ensureFoliolePublishCustomTheme(root, OFFICIAL_THEME_FILES);
  return { path: prepared.path, status: activateFoliolePublishCustomTheme(root) };
}

export function prepareFoliolePublishCustomTheme(root: string) {
  return ensureFoliolePublishCustomTheme(root, OFFICIAL_THEME_FILES);
}

export function selectFoliolePublishCustomTheme(root: string) {
  return activateFoliolePublishCustomTheme(root);
}

export function useFoliolePublishOfficialTheme(root: string) {
  return activateFoliolePublishOfficialTheme(root);
}

export function readFoliolePublishTheme(root: string) {
  const status = loadFoliolePublishThemeStatus(root);
  return status.active_theme === 'custom'
    ? readFoliolePublishCustomTheme(root)
    : OFFICIAL_THEME_FILES;
}
