import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

import { allocateItemAnswerHeight } from '../shared/ui/itemAnswerAllocation';

import './companionItemReviewLayout.css';

function naturalHeight(pane: HTMLElement | null) {
  const content = pane?.querySelector<HTMLElement>('.cm-content');
  const last = content?.lastElementChild;
  if (!content || !last || !pane) return 0;
  const inset = content.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  return inset + last.getBoundingClientRect().bottom - content.getBoundingClientRect().top
    + (Number.parseFloat(getComputedStyle(content).paddingBottom) || 0);
}

function useReviewSpace(root: RefObject<HTMLDivElement | null>, active: boolean, version: string) {
  useLayoutEffect(() => {
    const element = root.current;
    const surface = element?.closest<HTMLElement>('.companion-review-surface');
    if (!active || !element || !surface) return;
    const question = element.querySelector<HTMLElement>('.companion-item-edit-question');
    const answer = element.querySelector<HTMLElement>('.companion-item-edit-answer');
    const footer = surface.querySelector<HTMLElement>('.companion-review-footer');
    const update = () => {
      const surfaceTop = surface.getBoundingClientRect().top;
      const contentTop = element.getBoundingClientRect().top - surfaceTop + surface.scrollTop;
      const footerTop = footer ? footer.getBoundingClientRect().top - surfaceTop
        : surface.clientHeight - (Number.parseFloat(getComputedStyle(surface).paddingBottom) || 0);
      const available = Math.max(0, footerTop - contentTop);
      const questionHeight = naturalHeight(question);
      const answerHeight = naturalHeight(answer);
      element.style.minHeight = `${available}px`;
      element.style.gridTemplateRows = questionHeight + answerHeight <= available
        ? allocateItemAnswerHeight(available, questionHeight, answerHeight, 0.55).map(height => `${height}px`).join(' ')
        : 'auto auto';
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(surface);
    if (footer) observer?.observe(footer);
    const header = surface.querySelector('.companion-review-header');
    if (header) observer?.observe(header);
    for (const pane of [question, answer]) {
      const content = pane?.querySelector('.cm-content');
      if (content) observer?.observe(content);
    }
    const frame = requestAnimationFrame(update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      element.style.minHeight = '';
      element.style.gridTemplateRows = '';
    };
  }, [root, active, version]);
}

export function CompanionItemReviewLayout(props: { active: boolean; version: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useReviewSpace(root, props.active, props.version);
  return <div ref={root} className="companion-item-review-layout" data-active={props.active}>{props.children}</div>;
}
