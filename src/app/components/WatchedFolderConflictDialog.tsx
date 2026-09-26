import { forwardRef, useEffect, useState } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';
import type { WatchedFolderConflict } from '../../../lib/platform/watchedFolderConflictContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadDesktopSyncGroupOverview,
  onDesktopSyncGroupOverviewChanged,
  saveDesktopWatchedFolderConflict
} from '../../shared/platform/desktopSyncGroupRuntimeRepository';
import { isDesktopRuntime } from '../../shared/platform/runtime';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody,
  AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../shared/ui';

import { watchedFolderPlatformName } from './watchedFolderPlatformName';

export function WatchedFolderConflictDialog() {
  const [overview, setOverview] = useState<DesktopSyncGroupOverviewPayload | null>(null);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let active = true;
    const refresh = () => void loadDesktopSyncGroupOverview()
      .then((value) => { if (active) setOverview(value); });
    refresh();
    const unsubscribe = onDesktopSyncGroupOverviewChanged(refresh);
    return () => { active = false; unsubscribe?.(); };
  }, []);
  const conflicts = overview?.watched_folder_conflicts ?? [];
  if (!conflicts.length) return null;
  return (
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <ConflictContent conflicts={conflicts}
          localDeviceId={overview?.sync_group?.local_device_identity_key ?? ''}
          onSaved={setOverview} />
      </AppDialogPortal>
    </AppDialog>
  );
}

const ConflictContent = forwardRef<HTMLDivElement, {
  conflicts: WatchedFolderConflict[];
  localDeviceId: string;
  onSaved(value: DesktopSyncGroupOverviewPayload): void;
}>(function ConflictContent({ conflicts, localDeviceId, onSaved }, ref) {
  const t = useTranslation();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const ready = conflicts.every((conflict) => (selected[conflict.conflict_key]?.length ?? 0) > 0);

  function toggle(key: string, bindingId: string) {
    setSelected((current) => {
      const values = new Set(current[key] ?? []);
      if (values.has(bindingId)) values.delete(bindingId);
      else values.add(bindingId);
      return { ...current, [key]: [...values] };
    });
  }

  async function save() {
    setError(false);
    setSaving(true);
    try {
      const next = await saveDesktopWatchedFolderConflict(conflicts.map((conflict) => ({
        conflict_key: conflict.conflict_key,
        selected_binding_ids: selected[conflict.conflict_key] ?? []
      })));
      onSaved(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppDialogContent aria-describedby={undefined} className="w-[min(620px,calc(100vw-48px))]"
      layout="task" onEscapeKeyDown={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => event.preventDefault()} ref={ref}>
      <AppDialogTitle className="text-base font-semibold text-foreground">
        {t('desktop.watchedFolder.conflict.title')}
      </AppDialogTitle>
      <AppDialogBody className="max-h-[min(65vh,560px)] space-y-4 overflow-y-auto">
        <p className="text-sm text-foreground/65">{t('desktop.watchedFolder.conflict.description')}</p>
        {conflicts.map((conflict) => (
          <ConflictSection conflict={conflict} key={conflict.conflict_key}
            localDeviceId={localDeviceId} onToggle={toggle}
            selectedIds={selected[conflict.conflict_key] ?? []} />
        ))}
        {error ? <p className="text-sm text-error" role="alert">
          {t('desktop.watchedFolder.conflict.error')}
        </p> : null}
      </AppDialogBody>
      <AppDialogActions>
        <AppButton disabled={!ready || saving} loading={saving} onClick={() => void save()} variant="emphasis">
          {t('desktop.watchedFolder.conflict.save')}
        </AppButton>
      </AppDialogActions>
    </AppDialogContent>
  );
});

function ConflictSection({ conflict, localDeviceId, onToggle, selectedIds }: {
  conflict: WatchedFolderConflict;
  localDeviceId: string;
  onToggle(key: string, bindingId: string): void;
  selectedIds: string[];
}) {
  const t = useTranslation();
  return (
    <section className="rounded-lg border border-border p-4">
      <p className="break-all text-sm font-medium text-foreground">{conflict.path}</p>
      <div className="mt-3 space-y-2">
        {conflict.sources.map((source) => (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg-subtle"
            key={source.binding_id}>
            <input checked={selectedIds.includes(source.binding_id)}
              onChange={() => onToggle(conflict.conflict_key, source.binding_id)} type="checkbox" />
            <span className="min-w-0 truncate text-sm font-medium">{source.host_name}</span>
            <span className="shrink-0 text-xs text-foreground/55">
              {source.owner_device_identity_key === localDeviceId
                ? `${t('desktop.watchedFolder.conflict.local')} · ${watchedFolderPlatformName(source.host_platform)}`
                : watchedFolderPlatformName(source.host_platform)}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
