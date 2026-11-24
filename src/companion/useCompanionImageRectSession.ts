import { useRef, useState } from 'react';

import type { ImageFocusRect } from '../features/editor/model/markdownImageFocus';
import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import type { CompanionImageRectKind } from '../shared/platform/companion/editing/companionImageRect';

export type CompanionImageRects = Record<CompanionImageRectKind, ImageFocusRect | null>;
export type CompanionImageEditMode = 'cloze' | CompanionImageRectKind;

const same = (a: ImageFocusRect | null, b: ImageFocusRect | null) =>
  a === b || Boolean(a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
const rectOf = (region: ImageClozeDraftRegion): ImageFocusRect =>
  ({ x: region.x, y: region.y, width: region.width, height: region.height });

/** Focus and crop are each one rectangle in original-image coordinates, saved one at a time. */
export function useCompanionImageRectSession(props: {
  attachmentId: string; rects?: CompanionImageRects | undefined;
  onSaveRect?: ((kind: CompanionImageRectKind, rect: ImageFocusRect | null) => Promise<void>) | undefined;
}) {
  const saved: CompanionImageRects = props.rects ?? { focus: null, crop: null };
  const [drafts, setDrafts] = useState<CompanionImageRects>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const changed = (kind: CompanionImageRectKind) => !same(drafts[kind], saved[kind]);
  const set = (kind: CompanionImageRectKind, rect: ImageFocusRect | null) => setDrafts(current => ({ ...current, [kind]: rect }));
  return {
    busy, saving, error, changed,
    rect: (kind: CompanionImageRectKind) => drafts[kind],
    region: (kind: CompanionImageRectKind): ImageClozeDraftRegion[] => {
      const rect = drafts[kind];
      return rect ? [{ id: kind, attachmentId: props.attachmentId, answer: '', ...rect }] : [];
    },
    update: (kind: CompanionImageRectKind, region: ImageClozeDraftRegion) => set(kind, rectOf(region)),
    clear: (kind: CompanionImageRectKind) => set(kind, null),
    async save(kind: CompanionImageRectKind) {
      if (busy.current || !props.onSaveRect || !changed(kind)) return;
      busy.current = true; setSaving(true); setError(false);
      try { await props.onSaveRect(kind, drafts[kind]); }
      catch { setError(true); }
      finally { busy.current = false; setSaving(false); }
    }
  };
}
