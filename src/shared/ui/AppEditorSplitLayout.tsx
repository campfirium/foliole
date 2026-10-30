import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { allocateItemAnswerHeight } from './itemAnswerAllocation';

import './AppEditorSplitLayout.css';

function measureContent(pane: HTMLElement | null) {
  const content = pane?.querySelector<HTMLElement>('.cm-content');
  const last = content?.lastElementChild;
  if (!content || !last) return 0;
  // CodeMirror stretches short content to the viewport; measure the document itself.
  return last.getBoundingClientRect().bottom - content.getBoundingClientRect().top
    + (Number.parseFloat(getComputedStyle(content).paddingBottom) || 0);
}

export function AppEditorSplitLayout(props: {
  question: ReactNode;
  answer: ReactNode;
  questionVersion: string;
  answerVersion: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAnswer = Boolean(props.answer);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !hasAnswer) return;
    const question = root.firstElementChild as HTMLElement;
    const divider = question.nextElementSibling as HTMLElement;
    const answer = divider.nextElementSibling as HTMLElement;
    const update = () => {
      const available = root.clientHeight - divider.getBoundingClientRect().height;
      const heights = allocateItemAnswerHeight(available, measureContent(question), measureContent(answer));
      root.style.gridTemplateRows = `${heights[0]}px auto ${heights[1]}px`;
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(root);
    for (const pane of [question, answer]) {
      const content = pane.querySelector('.cm-content');
      if (content) observer?.observe(content);
    }
    const frame = requestAnimationFrame(update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      root.style.gridTemplateRows = '';
    };
  }, [hasAnswer, props.questionVersion, props.answerVersion]);

  return <div ref={rootRef}
    className={`app-editor-split-layout h-full min-h-0 w-full flex-1 ${hasAnswer ? 'grid' : 'flex flex-col'} ${props.className ?? ''}`}
    style={hasAnswer ? { gridTemplateRows: 'minmax(0, 61.8fr) auto minmax(0, 38.2fr)' } : undefined}>
    <div data-item-field="question" className="flex min-h-0 flex-1 flex-col">{props.question}</div>
    {hasAnswer && <>
      <div aria-hidden="true" className="relative h-3 shrink-0">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-[var(--role-content-line)] [width:min(100%,var(--document-max-width))]" />
      </div>
      <div data-item-field="answer" className="flex min-h-0 flex-col">{props.answer}</div>
    </>}
  </div>;
}
