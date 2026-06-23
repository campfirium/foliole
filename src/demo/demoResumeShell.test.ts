import { expect, it } from 'vitest';

import { installDemoResumeShell } from './demoResumeShell';

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
