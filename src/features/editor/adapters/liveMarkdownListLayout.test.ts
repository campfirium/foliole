import { afterEach, expect, it } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';
import { liveMarkdownSpacing } from './liveMarkdownSpacing';

afterEach(() => {
  document.body.innerHTML = '';
});

it('lays out nested list markers on two-character steps with a shared marker column', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, {
    initialContent: '- One\n  - Two\n    - [ ] Three'
  });
  const markers = Array.from(host.querySelectorAll<HTMLElement>('.cm-md-prefix-widget'));

  expect(markers.map((marker) => marker.dataset.mdListDepth)).toEqual(['0', '1', '2']);
  expect(markers.map((marker) => marker.style.marginInlineStart)).toEqual(['0em', '2em', '4em']);
  expect(liveMarkdownSpacing.listMarkerColumnInlineSize).toBe('2em');
  expect(liveMarkdownSpacing.listMarkerInlineEnd).toBe('0.5em');
  expect(markers[2]?.textContent).toBe('');

  adapter.destroy();
});
