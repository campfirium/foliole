import { useCallback, useEffect, useRef, useState } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle, AppInput } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { AddToDiveDialog } from './AddToDiveDialog';

export function useWorkspaceAddToDive() {
  const [sourceIds, setSourceIds] = useState<string[] | null>(null);
  const close = useCallback(() => setSourceIds(null), []);
  return {
    open: getDiveRepository() ? setSourceIds : undefined,
    dialog: sourceIds ? <WorkspaceAddToDive sourceIds={sourceIds} onClose={close} /> : null
  };
}

function WorkspaceAddToDive(props: { sourceIds: readonly string[]; onClose: () => void }) {
  const t = useTranslation();
  const [dives, setDives] = useState<Dive[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const { onClose } = props;
  useEffect(() => {
    let active = true;
    const repository = getDiveRepository();
    if (!repository) return;
    void repository.list().then((result) => {
      if (active) setDives(result);
    }).catch(() => {
      if (!active) return;
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.loadFailed'));
      onClose();
    });
    return () => { active = false; };
  }, [onClose, t]);

  async function save(action: (repository: NonNullable<ReturnType<typeof getDiveRepository>>) => Promise<Dive>) {
    const repository = getDiveRepository();
    if (!repository || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const dive = await action(repository);
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.added', { title: dive.title }));
      onClose();
    } catch {
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.saveFailed'));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function close() {
    if (!busy.current) onClose();
  }

  if (!dives) return null;
  if (creating) {
    return <CreateDiveDialog
      onClose={close}
      onCreate={(title) => void save((repository) => repository.create(title, props.sourceIds))}
      saving={saving}
    />;
  }
  return <AddToDiveDialog
    dives={dives}
    onAdd={(id, ids) => void save((repository) => repository.add(id, ids))}
    onClose={close}
    onCreate={() => setCreating(true)}
    sourceIds={props.sourceIds}
  />;
}

function CreateDiveDialog(props: { onClose: () => void; onCreate: (title: string) => void; saving: boolean }) {
  const t = useTranslation();
  const [title, setTitle] = useState('');
  return (
    <AppDialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(480px,calc(100vw-64px))]" layout="task">
          <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) props.onCreate(title.trim()); }}>
            <AppDialogTitle>{t('desktop.nodeList.addToDive.create')}</AppDialogTitle>
            <AppDialogBody>
              <AppInput aria-label={t('desktop.nodeList.addToDive.name')} maxLength={120}
                onChange={(event) => setTitle(event.currentTarget.value)} value={title} />
            </AppDialogBody>
            <AppDialogActions>
              <AppButton type="button" onClick={props.onClose} variant="ghost">{t('common.cancel')}</AppButton>
              <AppButton type="submit" disabled={props.saving || !title.trim()}>{t('desktop.nodeList.addToDive.createAndAdd')}</AppButton>
            </AppDialogActions>
          </form>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
