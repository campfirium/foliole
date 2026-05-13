import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

export function addReplace(ranges: Range<Decoration>[], from: number, to: number) {
  if (to <= from) return;
  ranges.push(Decoration.replace({}).range(from, to));
}

export function addMark(
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>
) {
  if (to <= from) return;
  ranges.push(Decoration.mark({ class: className, ...(attributes ? { attributes } : {}) }).range(from, to));
}

export function addLine(ranges: Range<Decoration>[], from: number, className: string) {
  ranges.push(Decoration.line({ attributes: { class: className } }).range(from));
}

export function addCodeFenceDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean,
  isCodeFenceLine: boolean
) {
  if (!isCodeFenceLine) return;

  const lineTo = from + text.length;
  if (showSyntax) {
    addMark(ranges, from, lineTo, 'cm-md-syntax-visible');
    return;
  }
  addReplace(ranges, from, lineTo);
}

export function addThematicBreakDecoration(
  ranges: Range<Decoration>[],
  from: number,
  text: string,
  showSyntax: boolean,
  isThematicBreak: boolean
) {
  if (!isThematicBreak) return;

  const lineTo = from + text.length;
  if (showSyntax) {
    addMark(ranges, from, lineTo, 'cm-md-syntax-visible');
    return;
  }
  ranges.push(
    Decoration.replace({
      inclusive: false,
      widget: new ThematicBreakWidget()
    }).range(from, lineTo)
  );
}

class ThematicBreakWidget extends WidgetType {
  override eq(other: ThematicBreakWidget) {
    return other instanceof ThematicBreakWidget;
  }

  override toDOM() {
    const rule = document.createElement('span');
    rule.className = 'cm-md-thematic-break';
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }
}
