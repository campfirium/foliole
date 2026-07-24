import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  notifyFoliolePublishedTopicsChanged,
  registerFoliolePublishedDeleteHandler
} from '../../shared/platform/foliolePublishedManagement';
import {
  inspectFoliolePublishedDeleteFromRuntime,
  unpublishFolioleTopicsFromRuntime
} from '../../shared/platform/foliolePublishRepository';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface PendingPublishedDelete {
  deleteAfterUnpublish: () => void;
  nodeIds: string[];
  sourceKeys: string[];
}

function usePublishedDeleteRegistration(
  setPending: (value: PendingPublishedDelete) => void,
  failureMessage: string
) {
  useEffect(() => registerFoliolePublishedDeleteHandler(({ nodeIds, onAllowed }) => {
    void inspectFoliolePublishedDeleteFromRuntime(nodeIds).then((result) => {
      if (result.status === 'allowed') {
        (onAllowed ?? (() => useWorkspaceStore.getState().deleteNodes(nodeIds)))();
      } else if (result.status === 'requires_unpublish') {
        setPending({
          deleteAfterUnpublish: onAllowed ?? (() => useWorkspaceStore.getState().deleteNodes(nodeIds)),
          nodeIds,
          sourceKeys: result.source_keys
        });
      } else {
        showAppRuntimeNotice(result.message);
      }
    }).catch((reason) => {
      showAppRuntimeNotice(reason instanceof Error ? reason.message : failureMessage);
    });
  }), [failureMessage, setPending]);
}

export function FoliolePublishedDeleteDialogHost() {
  const [pending, setPending] = useState<PendingPublishedDelete | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslation();

  usePublishedDeleteRegistration(setPending, t('desktop.foliolePublish.delete.failed'));

  const confirm = async () => {
    if (!pending || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await unpublishFolioleTopicsFromRuntime(pending.sourceKeys);
      if (result.status !== 'unpublished') {
        showAppRuntimeNotice(result.warning || t('desktop.foliolePublish.delete.failed'));
        return;
      }
      pending.deleteAfterUnpublish();
      notifyFoliolePublishedTopicsChanged();
      setPending(null);
    } catch {
      showAppRuntimeNotice(t('desktop.foliolePublish.delete.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !isSubmitting) setPending(null); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(440px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('desktop.foliolePublish.delete.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t(pending && pending.sourceKeys.length > 1
              ? 'desktop.foliolePublish.delete.descriptionMany'
              : 'desktop.foliolePublish.delete.description', { count: pending?.sourceKeys.length ?? 0 })}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={isSubmitting} onClick={() => setPending(null)} variant="ghost">
              {t('common.cancel')}
            </AppButton>
            <AppButton loading={isSubmitting} loadingLabel={t('desktop.foliolePublish.unpublishing')} onClick={() => void confirm()} variant="danger">
              {t('desktop.foliolePublish.delete.confirm')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
