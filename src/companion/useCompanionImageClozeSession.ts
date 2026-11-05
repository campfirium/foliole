import { useRef, useState } from 'react';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import type { ImageClozeEditorPresentation } from '../features/image-cloze/model/imageClozePresentation';
import type { ImageClozeRegionEdit } from '../features/image-cloze/model/imageClozeRegionEdit';

export type CompanionImageClozeSessionActions = {
  savedRegions?: ImageClozeEditorPresentation['regions'];
  onConfirm(regions: ImageClozeDraftRegion[], edits?: ImageClozeRegionEdit[]): Promise<void>;
  onDelete?(regionId: string): Promise<void>;
};

export function useCompanionImageClozeSession(props: CompanionImageClozeSessionActions, ready: boolean) {
  const busy = useRef(false);
  const [regions, setRegions] = useState<ImageClozeDraftRegion[]>([]);
  const [edits, setEdits] = useState<Record<string, ImageClozeRegionEdit>>({});
  const savedRegions = (props.savedRegions ?? []).map(region => edits[region.id]?.after ?? { ...region, answer: '' });
  const activeEdits = Object.values(edits).filter(edit => props.savedRegions?.some(region => region.id === edit.before.id));
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  async function confirm() {
    if (busy.current || (!regions.length && !activeEdits.length) || !ready) return;
    busy.current = true; setSaving(true); setError(false);
    try { await props.onConfirm(regions, activeEdits); }
    catch { setError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  async function removeSelected() {
    if (busy.current || !selected) return;
    if (regions.some(region => region.id === selected)) {
      setRegions(current => current.filter(region => region.id !== selected));
      setSelected(null);
      return;
    }
    if (!props.onDelete) return;
    busy.current = true; setSaving(true); setDeleteError(false);
    try { await props.onDelete(selected); setEdits(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== selected))); setSelected(null); }
    catch { setDeleteError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  function updateRegion(region: ImageClozeDraftRegion) {
    const before = props.savedRegions?.find(value => value.id === region.id);
    if (before) setEdits(current => ({ ...current, [region.id]: { before: current[region.id]?.before ?? { ...before, answer: '' }, after: region } }));
    else setRegions(current => current.map(value => value.id === region.id ? region : value));
  }
  return { busy, savedRegions, hasChanges: regions.length > 0 || activeEdits.length > 0, updateRegion, regions, setRegions, selected, setSelected, saving, error, deleteError, confirm, removeSelected };
}
