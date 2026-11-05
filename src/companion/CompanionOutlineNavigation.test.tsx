import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createExplicitArticleSnapshot, createNodeRecord } from '../shared/platform/companion/reading/companionReadableArticle.testSupport';
import { resolveReadableCompanionArticleByNodeId } from '../shared/platform/companionReadableArticle';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';

let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = installReadingRangeGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); });

it('navigates headings, Topics and Items in the same reader, including repeated selections', async () => {
  const snapshot = createExplicitArticleSnapshot();
  const content = '# Heading\n\nAlpha passage\n\nBeta passage';
  const selection = (text: string) => ({ from: content.indexOf(text), to: content.indexOf(text) + text.length });
  Object.assign(snapshot.nodesById, {
    'node-1': createNodeRecord({ id: 'node-1', content }),
    topic: createNodeRecord({ id: 'topic', parentNodeId: 'node-1', kind: 'topic',
      anchorLink: { id: 'topic', kind: 'highlight', locator: { ...selection('Alpha passage'), originalText: 'Alpha passage' } } }),
    item: createNodeRecord({ id: 'item', parentNodeId: 'node-1', kind: 'item',
      anchorLink: { id: 'item', kind: 'cloze', locator: { ...selection('Beta passage'), originalText: 'Beta passage' } } })
  });
  const article = resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')!;
  const exit = vi.fn();
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle snapshot={snapshot} readableArticle={article} onExit={exit} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const body = await screen.findByRole('document', { name: 'Topic body' });
  const editor = EditorView.findFromDOM(body)!;
  fireEvent.click(body);
  for (const [tab, label] of [['Outline', 'Heading'], ['Topic', 'Alpha passage'], ['Item', 'Beta passage'], ['Item', 'Beta passage']]) {
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(editor.state.selection.main.from).toBe(selection(label!).from));
    expect(editor.state.doc.toString()).toBe(content);
    expect(EditorView.findFromDOM(body)).toBe(editor);
    act(() => editor.dispatch({ selection: { anchor: 0 } }));
  }
  expect(exit).not.toHaveBeenCalled();
});
