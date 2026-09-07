import { useState } from 'react';

import type { NativeReadwiseIdentityBindingPreview } from '../../../lib/platform/nativeReadwiseIdentityContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  confirmReadwiseIdentityBindingsInRuntime,
  previewReadwiseIdentityBindingsInRuntime
} from '../../shared/platform/import/readwiseIdentityRuntimeRepository';
import { AppButton, SettingsControlSlot, SettingsRow } from '../../shared/ui';

export function ReadwiseIdentityBindingRow() {
  const t = useTranslation();
  const [preview, setPreview] = useState<NativeReadwiseIdentityBindingPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runPreview() {
    setPending(true);
    const next = await previewReadwiseIdentityBindingsInRuntime();
    setPreview(next);
    setMessage(next.status === 'ready'
      ? t('desktop.readwise.identity.preview.summary', {
        candidates: next.candidate_count, conflicts: next.conflict_count, unmatched: next.unmatched_count
      })
      : t(`desktop.readwise.identity.result.${next.status}`));
    setPending(false);
  }

  async function confirmPreview() {
    if (!preview?.preview_id) return;
    setPending(true);
    const result = await confirmReadwiseIdentityBindingsInRuntime(preview.preview_id);
    setMessage(result.status === 'bound'
      ? t('desktop.readwise.identity.confirmed', { count: result.bound_count })
      : t(`desktop.readwise.identity.result.${result.status}`));
    if (result.status === 'bound') setPreview(null);
    setPending(false);
  }

  return (
    <>
      <SettingsRow
        description={t('desktop.readwise.identity.description')}
        title={t('desktop.readwise.identity.title')}
      >
        <SettingsControlSlot>
          <AppButton disabled={pending} onClick={() => void runPreview()} size="sm">
            {pending ? t('desktop.readwise.api.connection.working') : t('desktop.readwise.identity.preview')}
          </AppButton>
          {preview?.status === 'ready' && preview.candidate_count > 0 ? (
            <AppButton disabled={pending} onClick={() => void confirmPreview()} size="sm" variant="emphasis">
              {t('desktop.readwise.identity.confirm')}
            </AppButton>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
      {message ? <p className="px-5 text-sm text-foreground/60" role="status">{message}</p> : null}
    </>
  );
}
