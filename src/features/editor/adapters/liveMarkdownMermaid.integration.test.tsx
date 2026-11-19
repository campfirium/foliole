import { screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { MarkdownMermaidPreviewDialog } from '../components/MarkdownMermaidPreviewDialog';
import { setEditorDisplayMode } from '../model/editorDisplayMode';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const invalidDiagram = [
  'flowchart TD',
  '    subgraph Problematic：Colon["Demo"]',
  '        A --> B',
  '    end'
].join('\n');

it('falls back to Mermaid source in the note and preview without leaving an error diagram', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  setEditorDisplayMode('preview');
  const host = document.body.appendChild(document.createElement('div'));
  const content = ['```mermaid', invalidDiagram, '```'].join('\n');
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });
  try {
    await waitFor(() => {
      expect(host.querySelector('.cm-md-mermaid-body')?.textContent).toBe(invalidDiagram);
    });
    expect(adapter.getContent()).toBe(content);
    expect(document.body).not.toHaveTextContent('Syntax error in text');

    const preview = renderWithLocalization(
      <MarkdownMermaidPreviewDialog diagram={{ source: invalidDiagram }} onOpenChange={vi.fn()} />
    );
    try {
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => {
        expect(dialog.querySelector('.cm-md-mermaid-preview')?.textContent).toBe(invalidDiagram);
      });
      expect(document.body).not.toHaveTextContent('Syntax error in text');
    } finally {
      preview.unmount();
    }

    adapter.setContent('Another note');
    expect(host).toHaveTextContent('Another note');
    expect(host.querySelector('.cm-md-mermaid-body')).toBeNull();
    expect(document.body).not.toHaveTextContent('Syntax error in text');
  } finally {
    adapter.destroy();
    host.remove();
    window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility);
  }
});
