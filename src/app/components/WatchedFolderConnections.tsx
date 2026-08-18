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

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows'
};

function groupBindings(bindings: NativeWatchedFolderBinding[], waitingLabel: string) {
  const groups = new Map<string, {
    bindings: NativeWatchedFolderBinding[];
    deviceName: string;
    platformName: string | null;
  }>();
  bindings.forEach((binding) => {
    const key = binding.connected_device_id ?? `waiting:${binding.binding_id}`;
    const group = groups.get(key) ?? {
      bindings: [],
      deviceName: binding.connected_device_name?.trim() || waitingLabel,
      platformName: binding.connected_platform ? PLATFORM_NAMES[binding.connected_platform] ?? null : null
    };
    group.bindings.push(binding);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

function WatchedFolderConnectionRow(props: {
  binding: NativeWatchedFolderBinding;
  currentDeviceId: string;
  onDisconnect: () => void;
  onReconnect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const local = props.binding.connected_device_id === props.currentDeviceId;
  const waiting = props.binding.connection_status === 'needs-folder';
  return (
    <SettingsRow
      description={!waiting
        ? t('desktop.watchedFolder.connected', { device: props.binding.connected_device_name ?? '' })
        : t('desktop.watchedFolder.needsFolder')}
      readonly={!local && !waiting}
      title={props.binding.primary_path || t('desktop.watchedFolder.source')}
    >
      <SettingsControlSlot className="flex gap-2">
        {waiting ? (
          <AppButton onClick={props.onReconnect} size="sm">{t('desktop.watchedFolder.reconnect.action')}</AppButton>
        ) : local ? (
          <AppButton onClick={props.onDisconnect} size="sm">{t('desktop.watchedFolder.disconnect')}</AppButton>
        ) : null}
        {local || waiting ? (
          <AppButton onClick={props.onRemove} size="sm" variant="danger">{t('desktop.watchedFolder.remove.action')}</AppButton>
        ) : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function WatchedFolderGroupList(props: {
  onDisconnect: (bindingId: string) => void;
  onReconnect: (bindingId: string) => void;
  onRemove: (bindingId: string) => void;
  state: NativeWatchedFolderBindingsState;
}) {
  const t = useTranslation();
  const groups = groupBindings(props.state.bindings, t('desktop.watchedFolder.connections.waiting'));
  if (!groups.length) return <SettingsRow readonly title={t('desktop.watchedFolder.connections.empty')} />;
  return groups.map((group) => (
    <section aria-label={group.deviceName} key={group.key} role="group">
      <div className="flex min-h-10 items-center gap-2 px-settings-panel-x">
        <span className="truncate text-ui-md font-semibold">{group.deviceName}</span>
        {group.platformName ? <span className="text-ui-sm text-foreground/50">{group.platformName}</span> : null}
      </div>
      {group.bindings.map((binding) => (
        <WatchedFolderConnectionRow
          binding={binding}
          currentDeviceId={props.state.current_device_id}
          key={binding.binding_id}
          onDisconnect={() => props.onDisconnect(binding.binding_id)}
          onReconnect={() => props.onReconnect(binding.binding_id)}
          onRemove={() => props.onRemove(binding.binding_id)}
        />
      ))}
    </section>
  ));
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

  if (!state) return null;
  return (
    <SettingsSection
      ariaLabel={t('desktop.watchedFolder.connections.title')}
      description={t('desktop.watchedFolder.connections.description')}
      title={t('desktop.watchedFolder.connections.title')}
    >
      <WatchedFolderGroupList
        onDisconnect={(bindingId) => void disconnectWatchedFolderInRuntime(bindingId).then(refresh)}
        onReconnect={(bindingId) => void reconnect(bindingId)}
        onRemove={(bindingId) => void remove(bindingId)}
        state={state}
      />
    </SettingsSection>
  );
}
