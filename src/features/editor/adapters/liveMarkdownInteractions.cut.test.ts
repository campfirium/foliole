import { expect, it, vi } from 'vitest';

import { createMockEditorView } from '../../../test/codeMirrorEditorViewTestSupport';

import { FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { handleApplicationCut } from './liveMarkdownInteractions';

function createCutView(exportable = true) {
  const replacement = { changes: { from: 7, to: 16 } };
  const view = createMockEditorView({
    state: {
      doc: {
        lineAt: () => ({ number: 1 }),
        line: () => ({ from: 0, text: 'Before important after' }),
        sliceString: (from: number, to: number) => exportable ? 'Before important after'.slice(from, to) : ''
      },
      facet: () => [],
      selection: { ranges: [{ empty: false, from: 7, to: 16 }] }
    }
  });
  Object.assign(view.state, { replaceSelection: vi.fn(() => replacement) });
  return { replacement, view };
}

it('leaves empty and read-only selections to the native editor behavior', () => {
  const { view } = createCutView();
  const event = createCutEvent({ setData: vi.fn() });
  Object.defineProperty(view.state, 'readOnly', { value: true });

  expect(handleApplicationCut(event, view)).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(view.dispatch).not.toHaveBeenCalled();
});

function createCutEvent(clipboardData: Pick<DataTransfer, 'setData'> | null) {
  return {
    clipboardData,
    preventDefault: vi.fn()
  } as unknown as ClipboardEvent;
}

it('writes every existing clipboard representation before one literal cut transaction', () => {
  const { replacement, view } = createCutView();
  const clipboardData = { setData: vi.fn() };
  const event = createCutEvent(clipboardData);

  expect(handleApplicationCut(event, view)).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'important');
  expect(clipboardData.setData).toHaveBeenCalledWith('text/html', '<p>important</p>');
  expect(clipboardData.setData).toHaveBeenCalledWith(FOLIOLE_CLIPBOARD_MIME, expect.any(String));
  expect(view.dispatch).toHaveBeenCalledOnce();
  expect(view.dispatch).toHaveBeenCalledWith(replacement, { userEvent: 'delete.cut' });
});

it.each([
  ['missing clipboard data', null],
  ['clipboard write failure', { setData: vi.fn(() => { throw new Error('denied'); }) }]
])('preserves the answer on %s', (_label, clipboardData) => {
  const { view } = createCutView();
  const event = createCutEvent(clipboardData);

  expect(handleApplicationCut(event, view)).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(view.dispatch).not.toHaveBeenCalled();
});

it('preserves a non-empty selection when export cannot be generated', () => {
  const { view } = createCutView(false);
  const event = createCutEvent({ setData: vi.fn() });

  expect(handleApplicationCut(event, view)).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(view.dispatch).not.toHaveBeenCalled();
});
