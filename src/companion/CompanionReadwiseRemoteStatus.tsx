import type { ReadwiseRemoteLifecycleState } from '../../lib/core/readwise/readwiseRemoteLifecycle';
import { useTranslation } from '../shared/localization/LocalizationProvider';

export function CompanionReadwiseRemoteStatus(props: {
  lifecycle: ReadwiseRemoteLifecycleState | null | undefined;
}) {
  const t = useTranslation();
  const lifecycle = props.lifecycle;
  if (!lifecycle || (lifecycle.reader === 'present' && lifecycle.export === 'present')) return null;
  const message = lifecycle.reader === 'unconfirmed' || lifecycle.export === 'unconfirmed'
    ? t('companion.readwise.remote.unconfirmed')
    : lifecycle.reader === 'missing' && lifecycle.export === 'deleted'
      ? t('companion.readwise.remote.missingDeleted')
      : lifecycle.reader === 'missing'
        ? t('companion.readwise.remote.missing')
        : t('companion.readwise.remote.exportDeleted');
  return (
    <p className="mx-4 mb-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-foreground/70" role="status">
      {message}
    </p>
  );
}
