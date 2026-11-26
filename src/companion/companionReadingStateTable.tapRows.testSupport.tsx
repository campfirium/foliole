// T886 reading state table, paths P5-P7: one tap or swipe has one owner while something is selected or open.
import { screen } from '@testing-library/react';

import { BODY } from './companionReadingStateTable.geometry.testSupport';
import { seen, type ReadingStateRow } from './companionReadingStateTable.rows.testSupport';
import { annotatableArticle, article, highlightedArticle, mount, shell } from './companionReadingStateTable.scenes.testSupport';
import { bodyText, selectBodyText, selectManagedText, type Probe } from './companionReadingStateTable.testSupport';
import { updateCompanionToolbarAppearance } from './companionSelectionToolbarPreference';

async function reviewQuestionWithSelection(probe: Probe) {
  const view = mount(shell({ nodeId: 'item-1' }));
  await probe.flush();
  selectBodyText();
  probe.startObserving();
  return view;
}

async function openHighlightMenu(probe: Probe) {
  mount(highlightedArticle());
  await probe.flush();
  await probe.tap(screen.getByText('Existing highlight'));
  await probe.flush(300);
  if (!document.querySelector('[data-companion-selection-toolbar]')) throw new Error('highlight menu did not open');
  probe.startObserving();
}

export const tapRows: ReadingStateRow[] = [
  { scene: 'P5 cloze review question with a native selection', event: 'tap outside the selection',
    expected: seen({ body: [BODY.flow], tap: [['clear-selection']] }),
    async run(probe) {
      await reviewQuestionWithSelection(probe);
      await probe.tap(bodyText());
    } },
  { scene: 'P5 cloze review question with a native selection', event: 'show the answer',
    expected: seen({ body: [BODY.flow] }),
    async run(probe) {
      const view = await reviewQuestionWithSelection(probe);
      view.rerender(shell({ nodeId: 'item-1', revealed: true }));
      await probe.flush(300);
      screen.getByText('Review answer');
    } },
  { scene: 'P6 paged, highlight menu only', event: 'tap the page edge twice', paged: true,
    expected: seen({ tap: [['close-menu'], ['turn-page']] }),
    async run(probe) {
      await openHighlightMenu(probe);
      await probe.tap(bodyText(), 355);
      await probe.tap(bodyText(), 355);
    } },
  { scene: 'P7 paged, native selection', event: 'swipe', paged: true,
    expected: seen({ selection: 'native', tap: [[]] }),
    async run(probe) {
      mount(article());
      await probe.flush();
      selectBodyText();
      probe.startObserving();
      await probe.swipeUp(bodyText());
    } },
  // Foliole manages reading ranges only on Android.
  { scene: 'P7 paged, Foliole-managed selection', event: 'swipe', paged: true, platforms: ['android'],
    expected: seen({ selection: 'managed', tap: [[]] }),
    async run(probe) {
      mount(annotatableArticle());
      await probe.flush();
      await selectManagedText(probe);
      probe.startObserving();
      await probe.swipeUp(bodyText());
    } },
  { scene: 'P7 paged, Foliole-managed selection', event: 'tap the page edge', paged: true, platforms: ['android'],
    expected: seen({ tap: [['clear-selection']] }),
    async run(probe) {
      mount(annotatableArticle());
      await probe.flush();
      await selectManagedText(probe);
      probe.startObserving();
      await probe.tap(bodyText(), 355);
    } },
  { scene: 'P5 article with a native selection, floating selection toolbar off', event: 'tap outside, then tap',
    expected: seen({ tools: 'visible', tap: [['clear-selection'], ['toggle-tools']] }),
    async run(probe) {
      updateCompanionToolbarAppearance({ selectionToolbarEnabled: false });
      mount(annotatableArticle());
      await probe.flush();
      selectBodyText();
      probe.startObserving();
      await probe.tap(bodyText());
      await probe.tap(bodyText());
    } },
  { scene: 'P5 paged, native selection', event: 'tap the page edge twice', paged: true,
    expected: seen({ tap: [['clear-selection'], ['turn-page']] }),
    async run(probe) {
      mount(article());
      await probe.flush();
      selectBodyText();
      probe.startObserving();
      await probe.tap(bodyText(), 355);
      await probe.tap(bodyText(), 355);
    } },
  { scene: 'P6 highlight menu only', event: 'tap the body twice',
    expected: seen({ tools: 'visible', tap: [['close-menu'], ['toggle-tools']] }),
    async run(probe) {
      await openHighlightMenu(probe);
      await probe.tap(bodyText());
      await probe.tap(bodyText());
    } }
];
