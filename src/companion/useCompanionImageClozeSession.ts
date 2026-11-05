import { useRef, useState } from 'react';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';

export type CompanionImageClozeSessionActions = {
  onConfirm(regions: ImageClozeDraftRegion[]): Promise<void>;
  onDelete?(regionId: string): Promise<void>;
};

export function useCompanionImageClozeSession(props: CompanionImageClozeSessionActions, ready: boolean) {
  const busy = useRef(false);
  const [regions, setRegions] = useState<ImageClozeDraftRegion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  async function confirm() {
    if (busy.current || !regions.length || !ready) return;
    busy.current = true; setSaving(true); setError(false);
    try { await props.onConfirm(regions); }
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
    try { await props.onDelete(selected); setSelected(null); }
    catch { setDeleteError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  return { busy, regions, setRegions, selected, setSelected, saving, error, deleteError, confirm, removeSelected };
}
