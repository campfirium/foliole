import { useEffect, useState } from 'react';

import type { NativeAideStorageInfo } from '../../../../../lib/platform/nativeAideStorageContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadAssistantStorageInfo,
  openAssistantStorageLocation
} from '../../../../shared/platform/assistantRuntime';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

type StorageState =
  | { kind: 'error' }
  | { kind: 'loading' }
  | { info: NativeAideStorageInfo; kind: 'ready' }
  | { kind: 'unavailable' };

const PREVIEW_INFO: NativeAideStorageInfo = {
  bytes: 25_800_000,
  complete: true,
  issueCount: 0,
  path: 'Foliole app data/Aide'
};

export function SettingsAideStorageSection({ preview = false }: { preview?: boolean }) {
  const t = useTranslation();
  const [openFailed, setOpenFailed] = useState(false);
  const [state, setState] = useState<StorageState>(
    preview ? { info: PREVIEW_INFO, kind: 'ready' } : { kind: 'loading' }
  );

  useEffect(() => {
    if (preview) return undefined;
    let active = true;
    void loadAssistantStorageInfo()
      .then((info) => {
        if (active) setState(info ? { info, kind: 'ready' } : { kind: 'unavailable' });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => { active = false; };
  }, [preview]);

  if (state.kind === 'unavailable') return null;
  const info = state.kind === 'ready' ? state.info : null;
  const status = storageStatus(state, t);
  return (
    <SettingsSection ariaLabel={t('settings.general.aide.aria')} title={t('settings.general.aide.section')}>
      <SettingsRow
        description={(
          <>
            <span className="block">{t('settings.general.aide.description')}</span>
            <span className="mt-1 block text-foreground/70">{status}</span>
            {info ? <span className="mt-1 block break-all font-mono text-foreground/60">{info.path}</span> : null}
            {openFailed ? <span className="mt-1 block text-destructive">{t('settings.general.aide.openError')}</span> : null}
          </>
        )}
        title={t('settings.general.aide.row')}
      >
        <SettingsControlSlot>
          <AppButton
            disabled={!info || preview}
            onClick={() => void openStorageLocation()}
            size="sm"
            type="button"
          >
            {t('settings.general.aide.open')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );

  async function openStorageLocation() {
    setOpenFailed(false);
    try {
      if (!await openAssistantStorageLocation()) setOpenFailed(true);
    } catch {
      setOpenFailed(true);
    }
  }
}

function storageStatus(state: StorageState, t: ReturnType<typeof useTranslation>) {
  if (state.kind === 'loading') return t('settings.general.aide.loading');
  if (state.kind === 'error') return t('settings.general.aide.error');
  if (state.kind === 'unavailable') return '';
  const size = formatBytes(state.info.bytes);
  return t(state.info.complete ? 'settings.general.aide.size' : 'settings.general.aide.sizePartial', { size });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
