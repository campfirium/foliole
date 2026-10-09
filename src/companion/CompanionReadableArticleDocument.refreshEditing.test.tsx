import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';

it('keeps the focused editor and continued input while its saved body is reloaded', async () => {
  const save = createContentSaveMock();
  let editor: EditorAdapter | null = null;
  const renderDocument = (bodyStatus: 'ready' | 'fetching', content: string) => (
    <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider>
      <ReadableArticleDocument allowContentEditing onSaveContent={save}
        onEditorReady={(adapter) => { editor = adapter; }}
        readableArticle={{ bodyStatus, content, currentVersionId: 'base', hideTitleHeading: false,
          nodeId: 'topic-1', persistedNodeViewState: null, pdfAttachmentId: null,
          textAnchorDecorations: [], title: 'Topic' }}
        readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
    </MouseGestureSettingsProvider></LocalizationProvider>
  );
  const view = render(renderDocument('ready', 'Original body'));
  await waitFor(() => expect(editor).not.toBeNull());
  const activeEditor = editor!;
  act(() => { activeEditor.focus(); activeEditor.replaceRange(0, 0, 'F'); });
  const focusedBody = screen.getByRole('textbox', { name: 'Topic body' });
  expect(focusedBody).toHaveFocus();
  await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 3000 });
  view.rerender(renderDocument('fetching', ''));
  expect(screen.getByRole('textbox', { name: 'Topic body' })).toBe(focusedBody);
  expect(focusedBody).toHaveFocus();
  act(() => activeEditor.replaceRange(1, 1, 'ri saved edit'));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith('topic-1', 'Fri saved editOriginal body', expect.anything()), { timeout: 3000 });
  view.rerender(renderDocument('ready', 'Fri saved editOriginal body'));
  expect(screen.getByRole('textbox', { name: 'Topic body' })).toBe(focusedBody);
  expect(focusedBody).toHaveFocus();
});
