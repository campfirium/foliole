// T886 reading state table, paths P1-P4: toolbars and system bars across scene changes.
// `expected` is the target behaviour. `gap` marks a row the model does not meet yet: `now` records today's
// behaviour and the target is an expected failure until the named closure removes the gap.
import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { BODY } from './companionReadingStateTable.geometry.testSupport';
import { host } from './companionReadingStateTable.host.testSupport';
import { article, mount, shell } from './companionReadingStateTable.scenes.testSupport';
import { bodyText, type Observation, type Platform, type Probe } from './companionReadingStateTable.testSupport';
import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';

export interface ReadingStateRow {
  scene: string;
  event: string;
  display?: { overlayToolbars?: boolean };
  paged?: boolean;
  platforms?: Platform[];
  /** Bars are given for Android; the table expects none on iOS, which never hides the status bar. */
  expected: Observation;
  gap?: { closure: '0-3' | '0-5'; platforms?: Platform[]; now: Observation };
  run(probe: Probe, platform: Platform): Promise<void>;
}

export const seen = (patch: Partial<Observation>): Observation =>
  ({ body: [BODY.article], bars: [], tools: 'hidden', selection: 'none', tap: [], ...patch });

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
  run: probe => openExternalWhileLoading(probe, entry)
}));

export const sessionRows: ReadingStateRow[] = [
  { scene: 'P1 docked reading', event: 'enter, tap, tap',
    expected: seen({ bars: ['hidden'], tap: toggled }), run: enterThenTapTwice },
  { scene: 'P1 floating reading', event: 'enter, tap, tap', display: { overlayToolbars: true },
    expected: seen({ body: [BODY.floating], bars: ['hidden'], tap: toggled }),
    run: enterThenTapTwice },
  // Toolbars start hidden on the next card: each newly mounted article opens a closed view in the session.
  { scene: 'P2 Flow card with toolbars shown', event: 'grade, slow load, next card',
    expected: seen({ body: [BODY.flow], tap: [['toggle-tools']] }),
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
  // The parent being browsed has no action bar of its own; the body keeps that band.
  { scene: 'P3 Flow child', event: 'breadcrumb to a slow parent, then resume',
    expected: seen({ body: [BODY.flow] }),
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
    expected: seen({ bars: ['shown'], tools: 'absent' }),
    async run(probe) {
      const view = mount(article());
      await probe.flush();
      probe.startObserving();
      view.rerender(<p>Library</p>);
      await probe.flush();
    } },
  ...externalEntryRows
];
