import { act, render, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';

it('persists the latest editor input when Done flushes before the editor debounce', async () => {
  const save = createContentSaveMock();
  const activity = new CompanionReadingActivity('topic', () => {});
  let editor: EditorAdapter | null = null;
  render(<LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider>
    <ReadableArticleDocument activity={activity} allowContentEditing onSaveContent={save}
      onEditorReady={value => { editor = value; }}
      readableArticle={{ content: 'Original body', currentVersionId: 'base', hideTitleHeading: false,
        nodeId: 'topic', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }}
      readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </MouseGestureSettingsProvider></LocalizationProvider>);
  await waitFor(() => expect(editor).not.toBeNull());
  act(() => editor!.replaceRange(0, 0, 'New input '));
  await act(() => activity.flush());
  expect(save).toHaveBeenCalledWith('topic', 'New input Original body', expect.anything());
});
