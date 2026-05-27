import type { Range } from '@codemirror/state';
import { Decoration, type EditorView, WidgetType } from '@codemirror/view';

import type { MarkdownCodeFenceBlock } from '../model/markdownCodeFenceProjection';
import { dispatchMarkdownMermaidPreviewRequest } from '../model/markdownMermaidPreview';

import { renderMermaidSvg } from './liveMarkdownMermaidRenderer';

function hashMermaidSource(source: string) {
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function resolveMermaidKind(source: string) {
  return source.trimStart().split(/\s+/, 1)[0]?.toLowerCase() || 'diagram';
}

interface MermaidSourceBlock {
  blockFrom: number;
  blockTo: number;
  source: string;
}

const BARE_MERMAID_START = /^(gantt|quadrantChart)\s*$/u;

function isBareMermaidStart(lineText: string) {
  return BARE_MERMAID_START.test(lineText.trim());
}

function isBareMermaidBodyLine(lineText: string) {
  return lineText.trim() !== '' && /^\s/.test(lineText);
}

export function collectBareMermaidBlocks(source: string, view: EditorView): MermaidSourceBlock[] {
  const blocks: MermaidSourceBlock[] = [];
  let lineNumber = 1;
  while (lineNumber <= view.state.doc.lines) {
    const startLine = view.state.doc.line(lineNumber);
    if (!isBareMermaidStart(startLine.text)) {
      lineNumber += 1;
      continue;
    }

    let endLine = startLine;
    let cursorLineNumber = lineNumber + 1;
    while (cursorLineNumber <= view.state.doc.lines) {
      const candidate = view.state.doc.line(cursorLineNumber);
      if (!isBareMermaidBodyLine(candidate.text)) break;
      endLine = candidate;
      cursorLineNumber += 1;
    }

    if (endLine.number > startLine.number) {
      blocks.push({ blockFrom: startLine.from, blockTo: endLine.to, source: source.slice(startLine.from, endLine.to).trim() });
    }
    lineNumber = Math.max(cursorLineNumber, lineNumber + 1);
  }
  return blocks;
}

class MermaidDiagramWidget extends WidgetType {
  readonly source: string;

  constructor(source: string) {
    super();
    this.source = source;
  }

  override eq(other: MermaidDiagramWidget) {
    return this.source === other.source;
  }

  override ignoreEvent() {
    return true;
  }

  override toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-mermaid-widget';
    wrapper.dataset.mdMermaidHash = hashMermaidSource(this.source);
    wrapper.dataset.mdMermaidKind = resolveMermaidKind(this.source);
    const surface = createMermaidSurface(this.source);
    wrapper.append(surface.root);
    renderMermaidDiagram(surface.body, this.source);
    return wrapper;
  }
}

interface MermaidSurface {
  body: HTMLElement;
  root: HTMLElement;
}

function createMermaidPreviewButton(source: string) {
  const button = document.createElement('button');
  button.className = 'cm-md-table-preview-button cm-md-mermaid-preview-button';
  button.setAttribute('aria-label', 'Open diagram preview');
  button.title = 'Open diagram preview';
  button.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M14 10l7-7"/><path d="M9 21H3v-6"/><path d="M10 14l-7 7"/></svg>';
  button.type = 'button';
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchMarkdownMermaidPreviewRequest(button, { source });
  });
  return button;
}

function createMermaidSurface(source: string): MermaidSurface {
  const root = document.createElement('div');
  root.className = 'cm-md-mermaid-surface';
  const body = document.createElement('div');
  body.className = 'cm-md-mermaid-body';
  root.append(createMermaidPreviewButton(source), body);
  return { body, root };
}

async function renderMermaidDiagram(wrapper: HTMLElement, source: string) {
  try {
    const id = `foliole-mermaid-${hashMermaidSource(source)}-${Date.now().toString(36)}`;
    const rendered = await renderMermaidSvg(id, source);
    if (!wrapper.isConnected) return;
    wrapper.innerHTML = rendered.svg;
    rendered.bindFunctions?.(wrapper);
  } catch {
    wrapper.classList.add('cm-md-mermaid-widget-error');
    wrapper.textContent = source;
  }
}

function isMermaidBlock(block: MarkdownCodeFenceBlock): block is MarkdownCodeFenceBlock & { diagramKind: 'mermaid' } {
  return block.diagramKind === 'mermaid';
}

export function addMermaidDecorations(
  ranges: Range<Decoration>[],
  source: string,
  blocks: readonly MermaidSourceBlock[],
  view: EditorView
) {
  for (const block of blocks) {
    const openingLine = view.state.doc.lineAt(block.blockFrom);
    const closingLine = view.state.doc.lineAt(block.blockTo);
    ranges.push(Decoration.line({ attributes: { class: 'cm-line-mermaid-block' } }).range(openingLine.from));
    ranges.push(
      Decoration.replace({
        inclusive: false,
        widget: new MermaidDiagramWidget(block.source)
      }).range(block.blockFrom, openingLine.to)
    );
    for (let lineNumber = openingLine.number + 1; lineNumber <= closingLine.number; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber);
      ranges.push(Decoration.line({ attributes: { class: 'cm-line-mermaid-source-hidden' } }).range(line.from));
      if (line.to > line.from) ranges.push(Decoration.replace({}).range(line.from, line.to));
    }
  }
}

export function collectFencedMermaidBlocks(source: string, codeBlocks: readonly MarkdownCodeFenceBlock[]): MermaidSourceBlock[] {
  return codeBlocks
    .filter(isMermaidBlock)
    .map((block) => ({
      blockFrom: block.blockFrom,
      blockTo: block.blockTo,
      source: source.slice(block.codeFrom, block.codeTo).trim()
    }));
}

export function collectMermaidLineFroms(blocks: readonly MermaidSourceBlock[], view: EditorView) {
  const lineFroms = new Set<number>();
  for (const block of blocks) {
    const openingLine = view.state.doc.lineAt(block.blockFrom);
    const closingLine = view.state.doc.lineAt(block.blockTo);
    for (let lineNumber = openingLine.number; lineNumber <= closingLine.number; lineNumber += 1) {
      lineFroms.add(view.state.doc.line(lineNumber).from);
    }
  }
  return lineFroms;
}
