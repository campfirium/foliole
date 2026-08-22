import type { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  confirmSourceManagement,
  previewSourceManagement
} from '../../../shared/platform/desktop/sourceManagementRepository';
import { requestAppConfirmation } from '../../../shared/ui';

function summary(t: ReturnType<typeof useTranslation>, preview: Awaited<ReturnType<typeof previewSourceManagement>>) {
  return t('settings.externalSources.management.summary', {
    paths: preview.sources.map((source) => source.root_path).join(', '),
    sources: preview.source_count,
    topics: preview.topic_count
  });
}

export async function removeExternalSource(sourceRef: string, refresh: () => void, t: ReturnType<typeof useTranslation>) {
  const input = { action: 'remove_source' as const, sourceRef };
  const preview = await previewSourceManagement(input);
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('settings.externalSources.management.cancel'),
    confirmLabel: t('settings.externalSources.management.removeConfirm'),
    description: summary(t, preview),
    title: t('settings.externalSources.management.removeTitle')
  });
  if (!confirmed) return;
  await confirmSourceManagement(input);
  refresh();
}

export async function replaceExternalSourceHost(hostName: string, refresh: () => void, t: ReturnType<typeof useTranslation>) {
  const input = { action: 'replace_host' as const, hostName, sourceType: 'external' as const };
  const preview = await previewSourceManagement(input);
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('settings.externalSources.management.cancel'),
    confirmLabel: t('settings.externalSources.management.replaceConfirm'),
    description: summary(t, preview),
    title: t('settings.externalSources.management.replaceTitle', { host: hostName })
  });
  if (!confirmed) return;
  await confirmSourceManagement(input);
  refresh();
}
