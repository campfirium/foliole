import { Facet } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

import { EditorOutlineTracker } from '../model/editorOutline';

import { createOutlinePositionMapper } from './codeMirrorOutlinePositionMap';

interface OutlineBinding {
  getNodeId: () => string | null;
  isApplyingExternalContent: () => boolean;
}

const outlineBinding = Facet.define<OutlineBinding, OutlineBinding>({ combine: values => values[0]! });
const outlinePlugin = ViewPlugin.fromClass(class {
  readonly source: EditorOutlineTracker;

  constructor(view: EditorView) {
    this.source = new EditorOutlineTracker(view.state.doc, view.state.facet(outlineBinding).getNodeId());
  }

  update(update: ViewUpdate) {
    const binding = update.state.facet(outlineBinding);
    this.source.update(update.state.doc, createOutlinePositionMapper(update), binding.getNodeId(), binding.isApplyingExternalContent());
  }

  destroy() { this.source.destroy(); }
});

export function createCodeMirrorOutlineExtension(binding: OutlineBinding) {
  return [outlineBinding.of(binding), outlinePlugin];
}

export function getCodeMirrorOutline(view: EditorView) {
  return view.plugin(outlinePlugin)!.source;
}
