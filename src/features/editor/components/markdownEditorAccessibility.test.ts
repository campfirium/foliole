import { describe, expect, it } from 'vitest';

import { syncMarkdownEditorAriaLabel } from './markdownEditorAccessibility';

describe('Markdown editor accessibility', () => {
  it('labels the editable CodeMirror content instead of only its host', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="cm-content" contenteditable="true"></div>';

    syncMarkdownEditorAriaLabel(host, 'Topic body');
    expect(host.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Topic body');

    syncMarkdownEditorAriaLabel(host, undefined);
    expect(host.querySelector('.cm-content')).not.toHaveAttribute('aria-label');
  });
});
