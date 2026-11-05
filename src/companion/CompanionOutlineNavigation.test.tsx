import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createOutlineFixture } from '../features/editor/model/documentOutlineNavigation.testSupport';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';

let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = installReadingRangeGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); });

it('locates headings and direct Highlights repeatedly and opens Items through the existing card action', async () => {
  const fixture = createOutlineFixture();
  const { snapshot } = fixture;
  const article = fixture.article();
  const content = article.content;
  const selection = (text: string) => ({ from: content.indexOf(text), to: content.indexOf(text) + text.length });
  const onOpen = vi.fn();
  const exit = vi.fn();
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle snapshot={snapshot} readableArticle={article} onExit={exit} onOpenExistingHighlight={onOpen} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const body = await screen.findByRole('document', { name: 'Topic body' });
  const editor = EditorView.findFromDOM(body)!;
  fireEvent.click(body);
  for (const label of ['Chapter', 'Alpha passage', 'Alpha passage']) {
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label, exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(editor.state.selection.main.from).toBe(selection(label!).from));
    expect(editor.state.doc.toString()).toBe(content);
    expect(EditorView.findFromDOM(body)).toBe(editor);
    act(() => editor.dispatch({ selection: { anchor: 0 } }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Beta passage' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledExactlyOnceWith('item'));
  expect(exit).not.toHaveBeenCalled();
});
