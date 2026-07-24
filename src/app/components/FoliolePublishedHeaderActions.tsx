import { useEffect, useState } from 'react';

import type { NativeFoliolePublishedTopic } from '../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadFoliolePublishedTopicsFromRuntime,
  unpublishFolioleTopicsFromRuntime
} from '../../shared/platform/foliolePublishRepository';
import {
  notifyFoliolePublishedTopicsChanged,
  subscribeFoliolePublishedTopicsChanged
} from '../../shared/platform/runtime/foliolePublishedManagement';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { AppButton, requestAppConfirmation } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

export function FoliolePublishedHeaderActions({ nodeId }: { nodeId: string }) {
  const [topic, setTopic] = useState<NativeFoliolePublishedTopic | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslation();

  useEffect(() => {
    const load = () => void loadFoliolePublishedTopicsFromRuntime().then((result) => {
      setTopic(result.status === 'ready'
        ? result.topics.find((candidate) => candidate.node_id === nodeId) ?? null
        : null);
    });
    load();
    return subscribeFoliolePublishedTopicsChanged(load);
  }, [nodeId]);

  if (!topic) return null;

  const unpublish = async () => {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('common.cancel'),
      confirmLabel: t('desktop.foliolePublish.unpublish'),
      description: t('desktop.foliolePublish.unpublishConfirm.description'),
      title: t('desktop.foliolePublish.unpublishConfirm.title')
    });
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const result = await unpublishFolioleTopicsFromRuntime([topic.source_key]);
      if (result.status !== 'unpublished') {
        showAppRuntimeNotice(result.warning);
        return;
      }
      notifyFoliolePublishedTopicsChanged();
    } catch (reason) {
      showAppRuntimeNotice(reason instanceof Error ? reason.message : t('desktop.foliolePublish.delete.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <AppButton disabled={!topic.url} onClick={() => { if (topic.url) void openExternalUrl(topic.url); }} size="sm" variant="ghost">
        {t('desktop.foliolePublish.publishedAction')}
      </AppButton>
      <AppButton loading={isSubmitting} loadingLabel={t('desktop.foliolePublish.unpublishing')} onClick={() => void unpublish()} size="sm" variant="ghost">
        {t('desktop.foliolePublish.unpublish')}
      </AppButton>
    </div>
  );
}
