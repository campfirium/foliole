import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { DEFAULT_STARTUP_DARK_PALETTE } from '../startupSkeletonDom';

import { installDemoResumeShell } from './demoResumeShell';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-base-color');
  document.documentElement.removeAttribute('data-resolved-base-color');
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

function createSkeletonDocument() {
  document.body.innerHTML = `
    <section id="boot-skeleton" class="startup-shell">
      <div class="startup-shell__rail"></div>
      <div class="startup-shell__folder"></div>
      <div class="startup-shell__topic"></div>
      <main class="startup-shell__document"></main>
      <aside class="startup-shell__sidebar"></aside>
    </section>
  `;
  return document;
}

it('marks an existing startup skeleton as the Demo resume shell', () => {
  const doc = createSkeletonDocument();

  expect(installDemoResumeShell(doc)).toBe(true);

  expect(doc.querySelector('#boot-skeleton.startup-shell--resume')).not.toBeNull();
  expect(doc.querySelector('#boot-skeleton')?.textContent?.trim()).toBe('');
});

it('creates a color-block shell when the host page has no static skeleton', () => {
  document.body.innerHTML = '<div id="root"></div>';

  expect(installDemoResumeShell(document)).toBe(true);

  expect(document.querySelector('#boot-skeleton.startup-shell--resume')).not.toBeNull();
  expect(document.querySelector('#demo-resume-shell-style')).not.toBeNull();
  expect(document.querySelector('.startup-shell__rail')).not.toBeNull();
  expect(document.querySelector('.startup-shell__folder')).not.toBeNull();
  expect(document.querySelector('.startup-shell__topic')).not.toBeNull();
  expect(document.querySelector('.startup-shell__document')).not.toBeNull();
  expect(document.querySelector('.startup-shell__sidebar')).not.toBeNull();
  expect(document.querySelector('#boot-skeleton')?.textContent?.trim()).toBe('');
});

it('applies local startup surface settings before React loads', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark, '["#111111","#222222","#333333","#444444","#555555"]');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark, '{"main-document":3}');

  expect(installDemoResumeShell(createSkeletonDocument())).toBe(true);

  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--startup-region-main-document-bg')).toBe('#444444');
});

it('keeps the static dark fallback aligned with startup skeleton defaults', async () => {
  const html = await readFile(path.resolve('src/demo/index.html'), 'utf8');

  expect(html).toContain(`--startup-rail-bg: ${DEFAULT_STARTUP_DARK_PALETTE[0]};`);
  expect(html).toContain(`--startup-folder-bg: ${DEFAULT_STARTUP_DARK_PALETTE[1]};`);
  expect(html).toContain(`--startup-topic-bg: ${DEFAULT_STARTUP_DARK_PALETTE[2]};`);
  expect(html).toContain(`--startup-document-bg: ${DEFAULT_STARTUP_DARK_PALETTE[3]};`);
  expect(html).toContain(`--startup-sidebar-bg: ${DEFAULT_STARTUP_DARK_PALETTE[4]};`);
});
