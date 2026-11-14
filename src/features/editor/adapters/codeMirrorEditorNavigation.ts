import { EditorView } from '@codemirror/view';

import { setCodeMirrorSelectionRanges } from './codeMirrorEditorAdapterActions';
import { isPositionNearViewportRatio, readEditorScrollMetrics, resolveDocumentPositionAtViewportY,
  resolvePositionViewportTop, revealEditorPosition } from './codeMirrorEditorAdapterView';
import { clampEditorPosition } from './codeMirrorEditorPosition';
import { getEditorLineBlockHeight, setEditorScrollTop } from './codeMirrorEditorViewport';
import { resolvePositionClientRect } from './codeMirrorPositionClientRect';
import { restoreEditorSelection, revealEditorSelection, revealEditorSelectionCentered,
  revealEditorSelectionNearest } from './codeMirrorSelectionActions';
import { toEditorPrimarySelection, toEditorSelectionRanges } from './codeMirrorSelectionRanges';
import { READING_VIEWPORT_RATIO, resolvePrimaryVisiblePosition } from './codeMirrorVisiblePosition';
import type { EditorRevealOptions, EditorScrollMetrics, EditorSelection } from './EditorAdapter';

export abstract class CodeMirrorEditorNavigation {
  protected abstract view: EditorView;

  getDocumentPositionAtViewportY(clientY: number) { return resolveDocumentPositionAtViewportY(this.view, clientY); }
  getDocumentPositionAtClientPoint(clientX: number, clientY: number) { return this.view.posAtCoords({ x: clientX, y: clientY }, false); }
  getDocumentPositionAtDomPoint(node: Node, offset: number) {
    return this.view.contentDOM.contains(node) ? this.view.posAtDOM(node, offset) : null;
  }
  getPrimaryVisiblePosition() { return resolvePrimaryVisiblePosition(this.view); }
  getPositionClientRect(position: number) { return resolvePositionClientRect(this.view, this.clampPosition(position)); }
  getPositionViewportTop(position: number) {
    return resolvePositionViewportTop(this.view, this.clampPosition(position))?.viewportTop ?? null;
  }
  isPositionNearViewportRatio(position: number, ratio: number, toleranceRatio?: number) {
    return isPositionNearViewportRatio(this.view, this.clampPosition(position), ratio, toleranceRatio);
  }
  getViewportRect() { return this.view.scrollDOM.getBoundingClientRect(); }
  revealPosition(position: number) { revealEditorPosition(this.view, this.clampPosition(position)); }
  revealReadingPosition(position: number) {
    // With outer scrolling, CodeMirror's scroller spans the document rather than the viewport.
    const scrollsOutsideEditor = this.view.dom.closest('[data-scroll-container="outer"]') !== null;
    const yMargin = scrollsOutsideEditor ? 0 : this.view.scrollDOM.clientHeight * READING_VIEWPORT_RATIO;
    this.view.dispatch({ effects: EditorView.scrollIntoView(this.clampPosition(position), { y: 'start', yMargin }) });
  }
  getSelection(): EditorSelection { return toEditorPrimarySelection(this.view.state.selection); }
  getSelectionRanges(): EditorSelection[] { return toEditorSelectionRanges(this.view.state.selection); }
  setSelection(selection: EditorSelection) { this.setSelectionRanges([selection]); }
  setSelectionRanges(selections: EditorSelection[]) {
    setCodeMirrorSelectionRanges(this.view, selections, (position) => this.clampPosition(position));
  }
  revealSelection(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position), undefined, options);
  }
  revealSelectionCentered(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelectionCentered(this.view, selection, (position) => this.clampPosition(position), options);
  }
  revealSelectionNearest(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelectionNearest(this.view, selection, (position) => this.clampPosition(position), options);
  }
  revealSelectionAtViewportRatio(selection: EditorSelection, ratio: number, options?: EditorRevealOptions) {
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position), ratio, options);
  }
  restoreSelection(selection: EditorSelection, options?: EditorRevealOptions) {
    restoreEditorSelection(this.view, selection, (position) => this.clampPosition(position), options);
  }
  protected clampPosition(position: number) {
    return clampEditorPosition(position, this.view.state.doc.length);
  }
  getScrollTop() { return this.view.scrollDOM.scrollTop; }
  getLineBlockHeight(lineNumber: number) { return getEditorLineBlockHeight(this.view, lineNumber); }
  setScrollTop(scrollTop: number) { setEditorScrollTop(this.view, scrollTop); }
  getScrollMetrics(): EditorScrollMetrics { return readEditorScrollMetrics(this.view); }
}
