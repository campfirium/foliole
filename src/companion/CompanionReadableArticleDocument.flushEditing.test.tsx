import { act, render, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { createContentSaveMock, deferred } from './companionContentEditingTestSupport';
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

it('keeps buffered continued input when an earlier save acknowledgement arrives', async () => {
  const save = createContentSaveMock();
  const acknowledgement = deferred<{ content: string; currentVersionId: string; submittedVersionId: string }>();
  save.mockImplementationOnce(() => acknowledgement.promise);
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
  act(() => editor!.replaceRange(0, 0, 'First '));
  let saving!: Promise<void>;
  act(() => { saving = activity.flush(); });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  act(() => editor!.replaceRange(0, 0, 'Continued '));
  const first = save.mock.calls[0]![2]!;
  await act(async () => {
    acknowledgement.resolve({ content: first.content, currentVersionId: first.versionId, submittedVersionId: first.versionId });
    await saving;
  });
  expect(editor!.getContent()).toBe('Continued First Original body');
  await act(() => activity.flush());
  expect(save).toHaveBeenLastCalledWith('topic', 'Continued First Original body', expect.objectContaining({ baseVersionId: first.versionId }));
});

it('keeps buffered editor input when a remote source refresh arrives before Done', async () => {
  const save = createContentSaveMock();
  const activity = new CompanionReadingActivity('topic', () => {});
  let editor: EditorAdapter | null = null;
  const document = (content: string, version: string) =>
    <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider>
      <ReadableArticleDocument activity={activity} allowContentEditing onSaveContent={save}
        onEditorReady={value => { editor = value; }}
        readableArticle={{ content, currentVersionId: version, hideTitleHeading: false,
          nodeId: 'topic', persistedNodeViewState: null, pdfAttachmentId: null,
          textAnchorDecorations: [], title: 'Topic' }}
        readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
    </MouseGestureSettingsProvider></LocalizationProvider>;
  const view = render(document('Original body', 'base'));
  await waitFor(() => expect(editor).not.toBeNull());
  act(() => editor!.replaceRange(0, 0, 'Local input '));
  save.setSource({ content: 'Remote body', versionId: 'remote' });
  await act(async () => { view.rerender(document('Remote body', 'remote')); });
  expect(editor!.getContent()).toBe('Local input Original body');
  await act(() => activity.flush());
  expect(save).toHaveBeenCalledWith('topic', 'Local input Original body', expect.objectContaining({ baseVersionId: 'base' }));
});
