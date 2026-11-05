import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { collectImageMatches } from '../features/editor/model/markdownImageMatches';
import type { ImageClozeRegionEdit } from '../features/image-cloze/model/imageClozeRegionEdit';
import { saveCompanionImageCloze, type CompanionImageClozeRequest } from '../shared/platform/companion/editing/companionImageCloze';
import { deleteCompanionImageCloze } from '../shared/platform/companion/editing/companionImageClozeDeletion';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';

import { CompanionImageClozeEditor } from './CompanionImageClozeEditor';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionImageClozePresentation } from './useCompanionImageClozePresentation';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Draft = Omit<CompanionImageClozeRequest, 'regions' | 'edits'> & { attachmentId: string; src: string };

export function CompanionImageClozeLayer(props: {
  activity: CompanionReadingActivity; nodeId: string; content: string; versionId: string | null;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>; children: ReactNode;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const accepted = useRef<string | null>(null);
  const snapshot = props.workspaceSync.state.workspace_snapshot;
  const node = snapshot?.nodesById[props.nodeId];
  const savedRegions = useCompanionImageClozePresentation(snapshot, props.nodeId);
  useEffect(() => subscribeCompanionReadingScope(() => setDraft(null)), []);
  useEffect(() => { setDraft(null); accepted.current = null; }, [props.nodeId]);
  function open(event: MouseEvent<HTMLDivElement>) {
    if (props.activity.editing || !node || !canCreateSelectionAnnotation(node) || node.deletedAt ||
      !supportsCompanionNodeMutationSurface('selection-annotation')) return;
    const target = event.target instanceof Element ? event.target : null;
    const widget = target?.closest<HTMLElement>('.cm-md-image-widget');
    if (!widget || !target?.closest('.cm-md-image-surface')) return;
    const image = widget.querySelector<HTMLImageElement>('.cm-md-image-element');
    if (!image?.complete || !image.naturalWidth) return;
    const from = Number(widget.dataset.mdImageFrom);
    const to = Number(widget.dataset.mdImageTo);
    const match = collectImageMatches(0, props.content).find(value => value.from === from && value.to === to);
    if (!match?.attachmentId || !match.source.startsWith('asset://')) return;
    event.preventDefault(); event.stopPropagation();
    accepted.current = null;
    setDraft({ nodeId: `node-${createCompanionUuid()}`, parentNodeId: node.id, expectedContent: props.content,
      expectedVersionId: props.versionId, imageRange: { from, to }, attachmentId: match.attachmentId,
      src: image.currentSrc || image.src, scope: getCompanionReadingScope() });
  }
  async function confirm(regions: CompanionImageClozeRequest['regions'], edits: ImageClozeRegionEdit[] = []) {
    if (!draft) return;
    await props.activity.flush('image-cloze');
    await props.activity.run('image-cloze', async () => {
      const signature = JSON.stringify({ regions, edits });
      if (accepted.current && accepted.current !== signature) throw new Error('image_cloze_saved_request_changed');
      if (!accepted.current) { await saveCompanionImageCloze({ ...draft, regions, edits }); accepted.current = signature; }
      if (draft.scope !== getCompanionReadingScope()) throw new Error('image_cloze_library_changed');
      await props.workspaceSync.refreshAfterMutation(undefined, props.nodeId);
    });
    setDraft(null);
  }
  async function remove(regionId: string) {
    if (!draft) return;
    await props.activity.flush('image-cloze');
    await props.activity.run('image-cloze', async () => {
      const versionId = await deleteCompanionImageCloze({ ...draft, regionId });
      setDraft(current => current ? { ...current, expectedVersionId: versionId } : null);
      await props.workspaceSync.refreshAfterMutation(undefined, props.nodeId);
    });
  }
  return <div className="contents" onClickCapture={open}>
    {props.children}
    {draft ? <CompanionImageClozeEditor key={draft.nodeId} attachmentId={draft.attachmentId} src={draft.src}
      savedRegions={savedRegions.filter(region => region.attachmentId === draft.attachmentId)}
      onCancel={() => { void props.activity.run('image-cloze', async () => {}); setDraft(null); }} onConfirm={confirm} onDelete={remove} /> : null}
  </div>;
}
