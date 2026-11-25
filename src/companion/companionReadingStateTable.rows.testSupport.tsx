// T886 reading state table, paths P1-P7: toolbars, system bars across scene changes, and tap ownership.
// `expected` is the target behaviour. `gap` marks a row the model does not meet yet: `now` records today's
// behaviour and the target is an expected failure until the named closure removes the gap.
import { screen } from '@testing-library/react';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { host } from './companionReadingStateTable.host.testSupport';
import { annotatableArticle, article, highlightedArticle, mount, shell } from './companionReadingStateTable.scenes.testSupport';
import { bodyText, selectBodyText, selectManagedText, type Observation, type Platform, type Probe } from './companionReadingStateTable.testSupport';
import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';

export interface ReadingStateRow {
  scene: string;
  event: string;
  display?: { overlayToolbars?: boolean };
  paged?: boolean;
  platforms?: Platform[];
  /** Bars are given for Android; the table expects none on iOS, which never hides the status bar. */
  expected: Observation;
  gap?: { closure: '0-2' | '0-3' | '0-4' | '0-5'; platforms?: Platform[]; now: Observation };
  run(probe: Probe, platform: Platform): Promise<void>;
}

export const seen = (patch: Partial<Observation>): Observation =>
  ({ body: ['reserved/reserved'], bars: [], tools: 'hidden', selection: 'none', tap: [], ...patch });

async function enterThenTapTwice(probe: Probe) {
  mount(article());
  await probe.flush();
  await probe.tap(bodyText());
  await probe.tap(bodyText());
}

const toggled = [['toggle-tools'], ['toggle-tools']];

// The two entries that mount the reader outside the shell show their own loading placeholder.
async function openExternalWhileLoading(probe: Probe, entry: 'search' | 'directory') {
  host.externalDocument = undefined;
  mount(entry === 'search'
    ? <CompanionSearchExternalArticle document={{ document_id: 'external-1' }} onExit={() => undefined} />
    : <CompanionDirectoryContent articleOnly onChangeSelection={() => undefined} onExitArticle={() => undefined}
      onSelectNode={() => undefined} selection={{ kind: 'externalDocument', documentId: 'external-1' }} snapshot={null}
      sortDirection="asc" sortKey="name" />);
  await probe.flush();
}

const externalEntryRows: ReadingStateRow[] = (['search', 'directory'] as const).map(entry => ({
  scene: `leaving the library through ${entry}`,
  event: 'open an external document whose body is still loading',
  expected: seen({ body: [], bars: ['hidden'], tools: 'absent' }),
  gap: { closure: '0-2', platforms: ['android'], now: seen({ body: [], tools: 'absent' }) },
  run: probe => openExternalWhileLoading(probe, entry)
}));

export const sessionRows: ReadingStateRow[] = [
  { scene: 'P1 docked reading', event: 'enter, tap, tap',
    expected: seen({ bars: ['hidden'], tap: toggled }), run: enterThenTapTwice },
  { scene: 'P1 floating reading', event: 'enter, tap, tap', display: { overlayToolbars: true },
    expected: seen({ body: ['edge/edge'], bars: ['hidden'], tap: toggled }),
    gap: { closure: '0-4', platforms: ['android'],
      now: seen({ body: ['reserved/edge', 'reserved/reserved'], bars: ['hidden'], tap: toggled }) },
    run: enterThenTapTwice },
  // Toolbars start hidden on the next card today because the article remounts; the session store must keep that.
  { scene: 'P2 Flow card with toolbars shown', event: 'grade, slow load, next card',
    expected: seen({ tap: [['toggle-tools']] }),
    async run(probe) {
      const view = mount(shell({ nodeId: 'topic-2' }));
      await probe.flush();
      probe.startObserving();
      await probe.tap(bodyText());
      view.rerender(shell({ nodeId: 'topic-2', loading: true }));
      await probe.flush(2000);
      view.rerender(shell({ nodeId: 'topic-1' }));
      await probe.flush(2000);
    } },
  // The parent being browsed has no bottom bar; Android lets the body drop to the edge there.
  { scene: 'P3 Flow child', event: 'breadcrumb to a slow parent, then resume',
    expected: seen({}),
    gap: { closure: '0-4', platforms: ['android'], now: seen({ body: ['reserved/edge', 'reserved/reserved'] }) },
    async run(probe) {
      const view = mount(shell({ nodeId: 'topic-2' }));
      await probe.flush();
      probe.startObserving();
      const browse = { nodeId: 'topic-1', flow: false, browsing: true };
      for (const scene of [{ ...browse, loading: true }, browse, { nodeId: 'topic-2', loading: true }, { nodeId: 'topic-2' }]) {
        view.rerender(shell(scene));
        await probe.flush(2000);
      }
    } },
  { scene: 'P4 reading', event: 'leave for the list',
    expected: seen({ body: ['reserved/reserved'], bars: ['shown'], tools: 'absent' }),
    gap: { closure: '0-2', platforms: ['android'], now: seen({ tools: 'absent' }) },
    async run(probe) {
      const view = mount(article());
      await probe.flush();
      probe.startObserving();
      view.rerender(<p>Library</p>);
      await probe.flush();
    } },
  ...externalEntryRows
];

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
    expected: seen({ tap: [['clear-selection']] }),
    gap: { closure: '0-3', now: seen({ selection: 'native', tap: [[]] }) },
    async run(probe) {
      await reviewQuestionWithSelection(probe);
      await probe.tap(bodyText());
    } },
  { scene: 'P5 cloze review question with a native selection', event: 'show the answer',
    expected: seen({}),
    gap: { closure: '0-3', now: seen({ selection: 'native' }) },
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
    gap: { closure: '0-3', now: seen({ selection: 'managed', tap: [['turn-page']] }) },
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
    } }
];
