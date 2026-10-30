import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';

let resize = () => {};
let available = 400;
let questionHeight = 60;
let answerHeight = 1000;
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: (props: {
  ariaLabel: string; value: string; readOnly: boolean; scrollContainer: string;
}) => <div className="cm-content" data-field={props.ariaLabel} data-scroll={props.scrollContainer}>
  <textarea aria-label={props.ariaLabel} defaultValue={props.value} readOnly={props.readOnly} />
</div> }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup(question = 60, answer = 1000) {
  available = 400; questionHeight = question; answerHeight = answer;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function(this: HTMLElement) {
    return this.classList.contains('companion-item-edit-layout') ? available : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function(this: HTMLElement) {
    return this.dataset.field === 'Question' ? questionHeight : answerHeight;
  });
  const save = createContentSaveMock({ content: 'Question\n\n', reveal: 'Answer\n\n', versionId: 'base' });
  const document = (editing: boolean) => <CompanionDraftProvider><ReadableArticleDocument isReviewItem
    allowContentEditing={editing} onSaveContent={save} answer="Answer\n\n" scrollContainer="outer"
    readableArticle={{ content: 'Question\n\n', nodeId: 'item', title: 'Item', hideTitleHeading: false,
      persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }}
    readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider>;
  const view = render(document(false));
  view.rerender(document(true));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question' })).not.toHaveAttribute('readonly'));
  const layout = view.container.querySelector<HTMLElement>('.companion-item-edit-layout');
  return { view, layout, document, save };
}

it.each([[60, 80, [60, 80]], [60, 1000, [60, 340]], [1000, 60, [340, 60]], [1000, 800, [200, 200]]])(
  'keeps both fields available with natural heights %s and %s', async (question, answer, expected) => {
    const { layout } = await setup(question as number, answer as number);
    expect(layout?.style.gridTemplateRows).toBe((expected as number[]).map(n => `${n}px`).join(' '));
    for (const content of screen.getAllByRole('textbox')) {
      expect(content.parentElement?.dataset.scroll).toBe('editor');
    }
  }
);

it('redistributes on keyboard resize and content resize without changing focus or source text', async () => {
  const { layout, view, document, save } = await setup();
  const question = screen.getByRole('textbox', { name: 'Question' });
  const answer = screen.getByRole('textbox', { name: 'Answer' });
  act(() => { answer.focus(); available = 220; resize(); });
  expect(layout?.style.gridTemplateRows).toBe('60px 160px');
  act(() => question.focus());
  expect(layout?.style.gridTemplateRows).toBe('60px 160px');
  expect(question).toHaveFocus();
  act(() => { questionHeight = 800; resize(); });
  expect(layout?.style.gridTemplateRows).toBe('110px 110px');
  act(() => { available = 1400; resize(); });
  expect(layout?.style.gridTemplateRows).toBe('700px 700px');
  expect(question).toHaveValue('Question\n\n');
  expect(answer).toHaveValue('Answer\n\n');
  expect(save).not.toHaveBeenCalled();
  view.rerender(document(false));
  expect(screen.getByRole('textbox', { name: 'Question' }).parentElement?.dataset.scroll).toBe('outer');
  expect(screen.getByRole('textbox', { name: 'Answer' }).parentElement?.dataset.scroll).toBe('outer');
});
