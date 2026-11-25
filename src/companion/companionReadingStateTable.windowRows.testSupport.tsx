// T886 reading state table, paths P8-P12: editing, outline, window changes and the iPhone path.
import { act, screen, within } from '@testing-library/react';

import { BODY } from './companionReadingStateTable.geometry.testSupport';
import { host } from './companionReadingStateTable.host.testSupport';
import { seen, type ReadingStateRow } from './companionReadingStateTable.rows.testSupport';
import { answeredItem, article, editableArticle, mount } from './companionReadingStateTable.scenes.testSupport';
import { bodyText, type Probe } from './companionReadingStateTable.testSupport';

// Editing is entered from the shown toolbars, so leaving it with them shown restores the earlier state.
async function editAndFinish(probe: Probe) {
  await probe.flush();
  await probe.tap(screen.getAllByText(/Reading body/)[0]!);
  probe.startObserving();
  await probe.click(screen.getByTestId('companion-reading-edit'));
  await probe.flush(500);
  if (!screen.queryByTestId('companion-reading-edit-done')) throw new Error('editing did not start');
  await probe.click(screen.getByTestId('companion-reading-edit-done'));
  await probe.flush(500);
}

const editingKeepsBars = {
  expected: seen({ tools: 'visible' }),
  gap: { closure: '0-5' as const, platforms: ['android' as const],
    now: seen({ bars: ['shown', 'hidden'], tools: 'visible' }) }
};

export const windowRows: ReadingStateRow[] = [
  { scene: 'P8 article', event: 'edit, then done', ...editingKeepsBars,
    async run(probe) {
      mount(editableArticle());
      await editAndFinish(probe);
    } },
  { scene: 'P9 answered review item', event: 'edit, then done', ...editingKeepsBars,
    async run(probe) {
      mount(answeredItem());
      await editAndFinish(probe);
    } },
  { scene: 'P10 reading', event: 'open the outline, then close it',
    expected: seen({ bars: ['shown', 'hidden'], tools: 'visible' }),
    async run(probe) {
      mount(article());
      await probe.flush();
      await probe.tap(bodyText());
      probe.startObserving();
      await probe.click(screen.getByRole('button', { name: 'Outline' }));
      await probe.click(within(screen.getByRole('dialog', { name: 'Outline' })).getByRole('button', { name: 'Close' }));
    } },
  { scene: 'P11 reading', event: 'return to the foreground, then rotate',
    expected: seen({ bars: ['hidden', 'hidden'] }),
    async run(probe) {
      mount(article());
      await probe.flush();
      probe.startObserving();
      await act(async () => { host.foreground.forEach(callback => callback()); });
      await probe.flush();
      await act(async () => { window.dispatchEvent(new Event('orientationchange')); });
      await probe.flush();
    } },
  { scene: 'P12 iPhone floating reading', event: 'enter, switch article, leave', platforms: ['ios'],
    display: { overlayToolbars: true },
    expected: seen({ body: [BODY.floating], tools: 'absent' }),
    async run(probe) {
      const view = mount(article());
      await probe.flush();
      view.rerender(article({}, 'topic-2'));
      await probe.flush(2000);
      view.rerender(<p>Library</p>);
      await probe.flush(2000);
    } }
];
