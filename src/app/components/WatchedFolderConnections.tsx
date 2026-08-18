import { useEffect, useState } from 'react';

import type {
  NativeWatchedFolderBinding,
  NativeWatchedFolderBindingsState
} from '../../../lib/platform/nativeWatchedFolderContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';
import {
  confirmWatchedFolderReconnectInRuntime,
  disconnectWatchedFolderInRuntime,
  loadWatchedFolderBindingsFromRuntime,
  previewWatchedFolderReconnectInRuntime,
  removeWatchedFolderInRuntime
} from '../../shared/platform/import/watchedFolderRuntimeRepository';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection, requestAppConfirmation } from '../../shared/ui';

function WatchedFolderConnectionRow(props: {
  binding: NativeWatchedFolderBinding;
  currentDeviceId: string;
  onDisconnect: () => void;
  onReconnect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const local = props.binding.connected_device_id === props.currentDeviceId;
  return (
    <SettingsRow
      description={props.binding.connection_status === 'connected'
        ? t('desktop.watchedFolder.connected', { device: props.binding.connected_device_name ?? '' })
        : t('desktop.watchedFolder.needsFolder')}
      title={props.binding.primary_path || t('desktop.watchedFolder.source')}
    >
      <SettingsControlSlot className="flex gap-2">
        {props.binding.connection_status === 'needs-folder' ? (
          <AppButton onClick={props.onReconnect} size="sm">{t('desktop.watchedFolder.reconnect.action')}</AppButton>
        ) : local ? (
          <AppButton onClick={props.onDisconnect} size="sm">{t('desktop.watchedFolder.disconnect')}</AppButton>
        ) : null}
        <AppButton onClick={props.onRemove} size="sm" variant="danger">{t('desktop.watchedFolder.remove.action')}</AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function WatchedFolderConnections() {
  const t = useTranslation();
  const [state, setState] = useState<NativeWatchedFolderBindingsState | null>(null);
  const refresh = () => void loadWatchedFolderBindingsFromRuntime().then(setState).catch(() => undefined);
  useEffect(refresh, []);

  async function reconnect(bindingId: string) {
    const folderPath = await selectRuntimeFolder();
    if (!folderPath) return;
    const preview = await previewWatchedFolderReconnectInRuntime(bindingId, folderPath);
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.watchedFolder.reconnect.cancel'),
      confirmLabel: t('desktop.watchedFolder.reconnect.confirm'),
      description: t('desktop.watchedFolder.reconnect.summary', {
        matched: preview.matched_count, missing: preview.missing_count, added: preview.new_count
      }),
      title: t('desktop.watchedFolder.reconnect.title')
    });
    if (!confirmed) return;
    await confirmWatchedFolderReconnectInRuntime(bindingId, folderPath);
    refresh();
  }

  async function remove(bindingId: string) {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.watchedFolder.remove.cancel'),
      confirmLabel: t('desktop.watchedFolder.remove.confirm'),
      description: t('desktop.watchedFolder.remove.description'),
      title: t('desktop.watchedFolder.remove.title')
    });
    if (!confirmed) return;
    await removeWatchedFolderInRuntime(bindingId);
    refresh();
  }

  if (!state?.bindings.length) return null;
  return (
    <SettingsSection
      ariaLabel={t('desktop.watchedFolder.connections.title')}
      description={t('desktop.watchedFolder.connections.description')}
      title={t('desktop.watchedFolder.connections.title')}
    >
      {state.bindings.map((binding) => (
        <WatchedFolderConnectionRow
          binding={binding}
          currentDeviceId={state.current_device_id}
          key={binding.binding_id}
          onDisconnect={() => void disconnectWatchedFolderInRuntime(binding.binding_id).then(refresh)}
          onReconnect={() => void reconnect(binding.binding_id)}
          onRemove={() => void remove(binding.binding_id)}
        />
      ))}
    </SettingsSection>
  );
}
