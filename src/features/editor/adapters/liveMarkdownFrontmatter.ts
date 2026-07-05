import { StateField, type EditorState, type Extension, type Range, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import { readDiscoursePublishedMeta } from '../../../../lib/core/discourse/discourseFrontmatter';
import { getEditorDisplayMode } from '../model/editorDisplayMode';
import type { FrontmatterDisplayMode } from '../model/frontmatterDisplayModeSetting';
import { getFrontmatterMetaFields } from '../model/frontmatterMetaFieldsSetting';
import { collectMarkdownLineClassRanges } from '../model/markdownBlockProjection';
import {
  projectMarkdownFrontmatter,
  type FrontmatterBounds
} from '../model/markdownFrontmatterProjection';

import {
  FrontmatterCompactWidget,
  FrontmatterYamlWidget,
  setFrontmatterModeEffect
} from './liveMarkdownFrontmatterWidget';
import { addLine, addReplace } from './liveMarkdownPrimitives';
import { activeNodeIdFacet } from './liveMarkdownState';

export { extractFrontmatterEntries, resolveFrontmatterBounds } from '../model/markdownFrontmatterProjection';

interface FrontmatterDecorationState {
  decorations: DecorationSet;
  inspectedUntilLine: number;
}

interface FrontmatterModeOverride {
  mode: FrontmatterDisplayMode;
  nodeId: string | null;
}

export function isLineWithinFrontmatter(bounds: FrontmatterBounds | null, lineNumber: number) {
  return Boolean(bounds && lineNumber >= bounds.startLine && lineNumber <= bounds.endLine);
}

export function addFrontmatterDecorations(ranges: Range<Decoration>[], view: EditorView) {
  const { decorations } = buildFrontmatterDecorationState(view);
  decorations.between(0, view.state.doc.length, (from, to, decoration) => {
    ranges.push(decoration.range(from, to));
  });
}

export function buildFrontmatterDecorationSet(view: EditorView): DecorationSet {
  return buildFrontmatterDecorationState(view).decorations;
}

function resolveEffectiveMode(override: FrontmatterModeOverride | null) {
  return override?.mode ?? 'compact';
}

function addFullFrontmatterDecorations(ranges: Range<Decoration>[], state: EditorState, bounds: FrontmatterBounds) {
  for (let lineNumber = bounds.startLine; lineNumber <= bounds.endLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    addLine(ranges, line.from, 'cm-line-frontmatter-hidden');
    addReplace(ranges, line.from, line.to);
  }
}

function addCompactFrontmatterDecorations(ranges: Range<Decoration>[], state: EditorState, bounds: FrontmatterBounds) {
  for (let lineNumber = bounds.startLine; lineNumber <= bounds.endLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    addLine(ranges, line.from, 'cm-line-frontmatter-hidden');
    addReplace(ranges, line.from, line.to);
  }
}

function shouldRebuildFrontmatter(transaction: Transaction, inspectedUntilLine: number) {
  let shouldRebuild = false;
  transaction.changes.iterChangedRanges((fromA) => {
    if (shouldRebuild) return;
    shouldRebuild = transaction.startState.doc.lineAt(fromA).number <= inspectedUntilLine;
  });
  return shouldRebuild;
}

function resolveFrontmatterWidgetAnchor(state: EditorState, bounds: FrontmatterBounds) {
  return resolveFrontmatterTitleLine(state, bounds)?.to ?? state.doc.line(bounds.endLine).to;
}

function resolveFrontmatterTitleLine(state: EditorState, bounds: FrontmatterBounds) {
  const h1LineFroms = new Set(
    collectMarkdownLineClassRanges(state.doc.toString())
      .filter((range) => range.className === 'cm-line-h1')
      .map((range) => range.from)
  );
  for (let lineNumber = bounds.endLine + 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (h1LineFroms.has(line.from)) return line;
    if (line.text.trim().length > 0) return null;
  }
  return null;
}

function buildFrontmatterDecorationState(
  viewOrState: EditorView | EditorState,
  override: FrontmatterModeOverride | null = null
): FrontmatterDecorationState {
  const state = viewOrState instanceof EditorView ? viewOrState.state : viewOrState;
  const { doc } = state;
  const ranges: Range<Decoration>[] = [];
  const projection = projectMarkdownFrontmatter(doc.toString());
  const { bounds } = projection;

  if (getEditorDisplayMode() === 'source') {
    return {
      decorations: Decoration.set(ranges, true),
      inspectedUntilLine: projection.inspectedUntilLine
    };
  }

  if (!bounds) {
    return {
      decorations: Decoration.set(ranges, true),
      inspectedUntilLine: projection.inspectedUntilLine
    };
  }

  const anchor = resolveFrontmatterWidgetAnchor(state, bounds);
  const titleLine = resolveFrontmatterTitleLine(state, bounds);
  const from = doc.line(bounds.startLine).from;
  const to = doc.line(bounds.endLine).to;
  const metaFields = getFrontmatterMetaFields();
  const discourseMeta = readDiscoursePublishedMeta(doc.toString());

  if (resolveEffectiveMode(override) === 'full') {
    addFullFrontmatterDecorations(ranges, state, bounds);
    ranges.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new FrontmatterYamlWidget(projection.entries, metaFields, discourseMeta, from, doc.sliceString(from, to), to)
      }).range(anchor)
    );
    return {
      decorations: Decoration.set(ranges, true),
      inspectedUntilLine: bounds.endLine
    };
  }

  addCompactFrontmatterDecorations(ranges, state, bounds);
  if (titleLine) {
    addLine(ranges, titleLine.from, 'cm-line-frontmatter-title');
  }

  ranges.push(
    Decoration.widget({
      block: true,
      side: 1,
      widget: new FrontmatterCompactWidget(projection.entries, metaFields, discourseMeta)
    }).range(anchor)
  );

  return {
    decorations: Decoration.set(ranges, true),
    inspectedUntilLine: bounds.endLine
  };
}

const frontmatterModeOverrideField = StateField.define<FrontmatterModeOverride | null>({
  create: () => null,
  update(value, transaction) {
    const startNodeId = transaction.startState.facet(activeNodeIdFacet);
    const nextNodeId = transaction.state.facet(activeNodeIdFacet);
    let nextValue = startNodeId === nextNodeId ? value : null;
    for (const effect of transaction.effects) {
      if (effect.is(setFrontmatterModeEffect)) {
        nextValue = { mode: effect.value, nodeId: nextNodeId };
      }
    }
    return nextValue?.nodeId === nextNodeId ? nextValue : null;
  }
});

const frontmatterDecorationsField = StateField.define<FrontmatterDecorationState>({
  create(state) {
    return buildFrontmatterDecorationState(state, null);
  },
  update(value, transaction) {
    const override = transaction.state.field(frontmatterModeOverrideField, false) ?? null;
    const nodeChanged = transaction.startState.facet(activeNodeIdFacet) !== transaction.state.facet(activeNodeIdFacet);
    if (
      nodeChanged ||
      transaction.effects.some((effect) => effect.is(setFrontmatterModeEffect)) ||
      (transaction.docChanged && shouldRebuildFrontmatter(transaction, value.inspectedUntilLine))
    ) {
      return buildFrontmatterDecorationState(transaction.state, override);
    }
    return {
      ...value,
      decorations: value.decorations.map(transaction.changes)
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

export const markdownFrontmatterDecorations: Extension = [
  frontmatterModeOverrideField,
  frontmatterDecorationsField
];
