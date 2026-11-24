import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { buildFormulaOccurrenceKey } from '../features/formula-cloze/model/formulaCloze';
import { createCompanionFormulaCloze, type CompanionFormulaClozeRequest } from '../shared/platform/companion/editing/companionFormulaCloze';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';

import { CompanionFormulaClozeEditor, type CompanionFormulaClozeDraft } from './CompanionFormulaClozeEditor';
import { CompanionImageClozeLayer } from './CompanionImageClozeLayer';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionFormulaClozePresentation } from './useCompanionFormulaClozePresentation';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Draft = { request: Omit<CompanionFormulaClozeRequest, 'regions'>; tex: string };

function readFormulaWidget(widget: HTMLElement, content: string) {
  const from = Number(widget.dataset.mdMathFrom);
  const to = Number(widget.dataset.mdMathTo);
  const tex = widget.dataset.mdMathTex ?? '';
  const display = widget.dataset.mdMathDisplay;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > content.length || !tex.trim()) return null;
  if (display !== 'block' && display !== 'inline') return null;
  const formulaSource = content.slice(from, to);
  if (!formulaSource.includes(tex)) return null;
  return { tex, formula: { display, formulaRange: { from, to }, formulaSource, occurrenceKey: buildFormulaOccurrenceKey({ display, from, to, tex }) } } as const;
}

/** Tapping a rendered formula in a topic opens a sheet where drawn regions become formula cloze Items, as dragging does on desktop. */
export function CompanionFormulaClozeLayer(props: {
  activity: CompanionReadingActivity; nodeId: string; content: string; versionId: string | null;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>; children: ReactNode;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const savedIds = useRef<Map<string, { nodeId: string; anchorId: string }>>(new Map());
  const snapshot = props.workspaceSync.state.workspace_snapshot;
  const node = snapshot?.nodesById[props.nodeId];
  const savedRegions = useCompanionFormulaClozePresentation(snapshot, props.nodeId);
  useEffect(() => subscribeCompanionReadingScope(() => setDraft(null)), []);
  useEffect(() => { setDraft(null); }, [props.nodeId]);
  function open(event: MouseEvent<HTMLDivElement>) {
    if (props.activity.editing || !node || !canCreateSelectionAnnotation(node) || node.deletedAt ||
      !supportsCompanionNodeMutationSurface('selection-annotation')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.cm-md-math-source-button')) return;
    const widget = target.closest<HTMLElement>('.cm-md-math-widget-block, .cm-md-math-widget-inline');
    if (!widget || widget.classList.contains('cm-md-math-widget-error') || widget.dataset.mdMathEditorNodeId !== props.nodeId) return;
    const read = readFormulaWidget(widget, props.content);
    if (!read) return;
    event.preventDefault(); event.stopPropagation();
    savedIds.current = new Map();
    setDraft({ tex: read.tex, request: { ...read.formula, parentNodeId: node.id, expectedContent: props.content,
      expectedVersionId: props.versionId, scope: getCompanionReadingScope() } });
  }
  async function confirm(drafts: CompanionFormulaClozeDraft[]) {
    if (!draft) return;
    // Each drawn region keeps its Item id across retries, so a retry after a committed save does not create it twice.
    const regions = drafts.map(value => {
      const ids = savedIds.current.get(value.id) ?? { nodeId: `node-${createCompanionUuid()}`, anchorId: `formula-${createCompanionUuid()}` };
      savedIds.current.set(value.id, ids);
      return { ...ids, selection: value.selection };
    });
    await props.activity.flush('formula-cloze');
    await props.activity.run('formula-cloze', async () => {
      await createCompanionFormulaCloze({ ...draft.request, regions });
      if (draft.request.scope !== getCompanionReadingScope()) throw new Error('formula_cloze_library_changed');
      await props.workspaceSync.refreshAfterMutation(undefined, props.nodeId);
    });
    setDraft(null);
  }
  return <div className="contents" onClickCapture={open}>
    {props.children}
    {draft ? <CompanionFormulaClozeEditor key={draft.request.occurrenceKey} tex={draft.tex} display={draft.request.display}
      savedRegions={savedRegions.filter(region => region.occurrenceKey === draft.request.occurrenceKey)}
      newId={() => `draft-${createCompanionUuid()}`}
      onCancel={() => setDraft(null)} onConfirm={confirm} /> : null}
  </div>;
}

/** The reading surface's cloze creators: tapping an image or a formula opens its own creation sheet. */
export function CompanionReadingClozeLayers(props: Parameters<typeof CompanionFormulaClozeLayer>[0]) {
  return <CompanionImageClozeLayer {...props}>
    <CompanionFormulaClozeLayer {...props} />
  </CompanionImageClozeLayer>;
}
