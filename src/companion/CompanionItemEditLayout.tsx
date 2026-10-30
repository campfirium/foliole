import { useEffect, useRef, type ReactNode } from 'react';

import { allocateItemEditHeight } from './companionItemEditAllocation';

import './companionItemEditLayout.css';

export function CompanionItemEditLayout(props: { active: boolean; question: ReactNode; answer: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!props.active || !element) return;
    const panes = Array.from(element.children) as HTMLElement[];
    const update = () => {
      const available = element.clientHeight;
      const heights = panes.map(pane => {
        const content = pane.querySelector<HTMLElement>('.cm-content');
        if (!content) return pane.scrollHeight;
        const section = pane.querySelector<HTMLElement>('[data-companion-article-document]');
        const inset = section ? Number.parseFloat(getComputedStyle(section).paddingTop) || 0 : 0;
        const border = Number.parseFloat(getComputedStyle(pane).borderTopWidth) || 0;
        return content.scrollHeight + inset + border;
      });
      const [question, answer] = allocateItemEditHeight(available, heights[0] ?? 0, heights[1] ?? 0);
      element.style.gridTemplateRows = `${question}px ${answer}px`;
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const pane of panes) {
      const content = pane.querySelector('.cm-content');
      if (content) observer?.observe(content);
    }
    update();
    return () => observer?.disconnect();
  }, [props.active]);
  return <div ref={root} className="companion-item-edit-layout" data-active={props.active}>
    <div className="companion-item-edit-question">{props.question}</div>
    <div className="companion-item-edit-answer">{props.answer}</div>
  </div>;
}
